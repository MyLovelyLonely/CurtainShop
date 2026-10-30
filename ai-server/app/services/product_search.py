"""ค้นหาสินค้า (หัวข้อ 2.2–2.3) + สร้างเวกเตอร์ของสินค้าเก็บใน vector_embedding

ข้อความ: BGE-M3 (ความหมาย) + BM25 (คีย์เวิร์ด/รหัส) + คำค้นเชิงโครงสร้าง + OpenCLIP ข้อความ→รูป → รวมด้วย RRF
รูปภาพ: คะแนน = โทนสีใกล้เคียง + โบนัสเมื่อลายคล้าย (OpenCLIP รูป→รูป ผ่าน pgvector)
  ลูกค้าส่วนใหญ่ไม่ได้ถ่ายรูปผ้าเต็มกรอบ จึงไม่ค้นแบบเป๊ะ — ลายไม่ตรงก็ยังได้ผ้าโทนสีใกล้เคียง
  (OpenCLIP แทบไม่สนสี: รูปสีชมพูเรียบได้คะแนนกับผ้ากรมท่าเรียบสูงกว่าผ้าชมพู จึงใช้สีเป็นหลัก ลายเป็นโบนัส)
"""
import hashlib
import logging
import threading
import time

import numpy as np
from PIL import Image

from app.config import SEARCH_LLM
from app.services import bm25_rrf, color, db, embedding, imageio
from app.services.curtain_render import fabric_region

log = logging.getLogger(__name__)

# เกณฑ์ความคล้าย (cosine) ขั้นต่ำ — ต่ำกว่านี้ถือว่าไม่เกี่ยวข้อง ไม่เอาเข้าการรวมอันดับ
# (วัดจากชุดทดสอบ: ตรงกัน / ไม่เกี่ยวข้อง เช่น "รถยนต์สีแดง")
TEXT_MIN = 0.50  # BGE-M3 คำค้น ↔ ข้อความสินค้า: ตรง 0.59–0.70 / ไม่เกี่ยว ≤ 0.40
CLIP_TEXT_MIN = 0.12  # OpenCLIP คำค้น ↔ รูปผ้า: ตรง 0.19–0.23 / ไม่เกี่ยว ≤ 0.10
# สินค้าที่เจอจากการเดาความหมาย/หน้าตาลายเพียงทางเดียว (ไม่มีคำตรงกันเลย) ต้องคล้ายมากกว่านี้
# กันกรณีอย่าง "ซักแห้ง" ได้ผ้าที่เขียนว่า "ซักมือ" เพราะความหมายใกล้กัน
SEMANTIC_ALONE_MIN = 0.60
VISUAL_ALONE_MIN = 0.18
# ค้นด้วยรูป (วัดจากรูปถ่ายจำลอง: ผ้าบนโต๊ะ/พื้นหลัง แสงไม่สม่ำเสมอ, รูปสีเรียบ เช่น หมอนอิง)
PATTERN_FROM = 0.55  # OpenCLIP เกินนี้ถึงได้โบนัสลาย (ผ้าเรียบกับรูปสีเรียบอะไรก็ได้ ~0.5–0.63)
PATTERN_WEIGHT = 1.2
PATTERN_LABEL = 0.60  # OpenCLIP ตั้งแต่นี้ แสดงว่า "ลายคล้าย" ไม่งั้น "สีใกล้เคียง"
IMAGE_SCORE_MIN = 0.30  # คะแนนรวมต่ำกว่านี้ไม่แสดง (ผ้าที่ตรงได้ ~0.5–1.2)
CANDIDATES = 50

_SELECT = """
select p.product_id, p.name, p.description, p.details, p.image_url, c.name as catalog_name
from product p join catalog c on c.catalog_id = p.catalog_id
"""

# ---------- รายการสินค้า (cache สั้น ๆ) ----------

_cache: dict = {"at": 0.0, "rows": {}}
_cache_lock = threading.Lock()


def _visible_products() -> dict[int, dict]:
    with _cache_lock:
        if time.time() - _cache["at"] > 60:
            with db.connect() as conn:
                rows = conn.execute(_SELECT + " where c.is_visible").fetchall()
            _cache.update(at=time.time(), rows={r["product_id"]: r for r in rows})
        return _cache["rows"]


def invalidate():
    with _cache_lock:
        _cache["at"] = 0.0


def swatch_url(p: dict) -> str | None:
    images = (p.get("details") or {}).get("images") or []
    return images[0] if images else p.get("image_url")


# ---------- สร้างเวกเตอร์ของสินค้า ----------


def _image_vec(url: str | None) -> np.ndarray | None:
    if not url:
        return None
    try:
        img = imageio.load_url(url, 1024)
    except ValueError as e:  # รูปไม่ได้อยู่ใน storage ของร้าน / โหลดไม่ได้
        log.warning("ข้ามรูป %s: %s", url, e)
        return None
    return embedding.clip_images([fabric_region(img)])[0]


def index_products(ids: list[int] | None) -> dict:
    """สร้างเวกเตอร์ข้อความ (BGE-M3) + รูป (OpenCLIP) ใหม่ แล้วแทนที่ของเดิมใน vector_embedding (ids=None = ทุกสินค้า)"""
    with db.connect() as conn:
        rows = (
            conn.execute(_SELECT + " where p.product_id = any(%s)", (ids,)).fetchall()
            if ids is not None
            else conn.execute(_SELECT).fetchall()
        )
    if not rows:
        return {"products": 0, "text": 0, "image": 0, "image_skipped": []}

    text_vecs = embedding.text([bm25_rrf.product_text(r) for r in rows])
    inserts, skipped = [], []
    for r, tv in zip(rows, text_vecs):
        inserts.append((r["product_id"], "text", embedding.to_pg(tv)))
        iv = _image_vec(swatch_url(r))
        if iv is None:
            skipped.append(r["product_id"])
        else:
            inserts.append((r["product_id"], "image", embedding.to_pg(iv)))

    pids = [r["product_id"] for r in rows]
    with db.connect() as conn, conn.transaction():
        conn.execute("delete from vector_embedding where product_id = any(%s)", (pids,))
        with conn.cursor() as cur:
            cur.executemany(
                "insert into vector_embedding (product_id, embedding_type, vector_data) values (%s, %s, %s::vector)",
                inserts,
            )
    invalidate()
    return {"products": len(rows), "text": len(rows), "image": len(rows) - len(skipped), "image_skipped": skipped}


# ---------- สินค้าทดสอบที่ไม่อยู่ใน DB (ส่งมาจากเว็บ) ----------
# ชั่วคราวช่วงทดสอบ: ดู web/src/services/test-products.ts — เวกเตอร์คำนวณสดแล้วเก็บไว้ในหน่วยความจำ

_extra_cache: dict[str, np.ndarray | None] = {}


def _extra_vecs(extra: list[dict]) -> tuple[dict[int, np.ndarray], dict[int, np.ndarray]]:
    text_v, image_v = {}, {}
    for p in extra:
        t = bm25_rrf.product_text(p)
        tk = "t:" + hashlib.sha1(t.encode()).hexdigest()
        if tk not in _extra_cache:
            _extra_cache[tk] = embedding.text([t])[0]
        text_v[p["product_id"]] = _extra_cache[tk]
        url = swatch_url(p)
        ik = "i:" + (url or "")
        if ik not in _extra_cache:
            _extra_cache[ik] = _image_vec(url)
        if _extra_cache[ik] is not None:
            image_v[p["product_id"]] = _extra_cache[ik]
    return text_v, image_v


# ---------- โทนสีของผ้า (คำนวณครั้งแรกที่ใช้ แล้วเก็บในหน่วยความจำ) ----------

_palette_cache: dict[str, np.ndarray | None] = {}


def _palette(url: str | None) -> np.ndarray | None:
    if not url:
        return None
    if url not in _palette_cache:
        try:
            _palette_cache[url] = color.palette(fabric_region(imageio.load_url(url, 512)))
        except ValueError:
            _palette_cache[url] = None
    return _palette_cache[url]


# ---------- ค้นหา ----------


def _vector_rank(vec: np.ndarray, kind: str, extra: dict[int, np.ndarray], minimum: float) -> list[tuple[int, float]]:
    """pgvector: สินค้าที่มองเห็นได้ เรียงตามความคล้าย (1 - cosine distance) + สินค้าทดสอบ"""
    lit = embedding.to_pg(vec)
    with db.connect() as conn:
        rows = conn.execute(
            """
            select ve.product_id, max(1 - (ve.vector_data <=> %s::vector)) as sim
            from vector_embedding ve
            join product p on p.product_id = ve.product_id
            join catalog c on c.catalog_id = p.catalog_id
            where c.is_visible and ve.embedding_type = %s
            group by ve.product_id
            order by sim desc
            limit %s
            """,
            (lit, kind, CANDIDATES),
        ).fetchall()
    sims = {r["product_id"]: float(r["sim"]) for r in rows}
    for pid, v in extra.items():
        sims[pid] = float(np.dot(vec, v))
    return sorted(((p, s) for p, s in sims.items() if s >= minimum), key=lambda x: -x[1])


def _llm_extract(q: str) -> dict:
    """(ตัวเลือก) ให้ LLM สกัดสี/ลาย/การกรองแสงจากคำค้น"""
    from app.services import vlm

    try:
        res = vlm._client.chat.completions.create(
            model=vlm.VLM_MODEL,
            temperature=0,
            timeout=15,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "user",
                    "content": "Extract curtain-fabric search filters from this Thai/English query. "
                    'Return JSON {"colors": [Thai color words], "patterns": [one of plain,texture,stripe,floral,'
                    'geometric,damask,botanical,kids], "lights": [one of sheer,dimout,blackout]}. Query: ' + q,
                }
            ],
        )
        out = vlm.parse_json(res.choices[0].message.content or "")
        return {k: set(out.get(k) or []) for k in ("colors", "patterns", "lights")}
    except Exception:  # noqa: BLE001 — LLM ใช้ไม่ได้ก็ยังค้นด้วยวิธีอื่นได้
        log.exception("LLM สกัดคำค้นไม่สำเร็จ")
        return {"colors": set(), "patterns": set(), "lights": set()}


def search_text(q: str, extra: list[dict], limit: int) -> dict:
    products = {**_visible_products(), **{p["product_id"]: p for p in extra}}
    text_extra, image_extra = _extra_vecs(extra)

    colors = {c for p in products.values() for c in ((p.get("details") or {}).get("colors") or [])}
    want = bm25_rrf.extract(q, colors)
    if SEARCH_LLM:
        for k, v in _llm_extract(q).items():
            want[k] |= v

    lists = {
        "keyword": bm25_rrf.BM25({pid: bm25_rrf.product_text(p) for pid, p in products.items()}).rank(q),
        "semantic": _vector_rank(embedding.text([q])[0], "text", text_extra, TEXT_MIN),
        "structured": bm25_rrf.structured_rank(want, products),
        "visual": _vector_rank(embedding.clip_texts([q])[0], "image", image_extra, CLIP_TEXT_MIN),
    }
    sim = {name: dict(ranked) for name, ranked in lists.items()}

    def keep(pid: int, via: list[str]) -> bool:
        if via == ["semantic"]:
            return sim["semantic"][pid] >= SEMANTIC_ALONE_MIN
        if via == ["visual"]:
            return sim["visual"][pid] >= VISUAL_ALONE_MIN
        if set(via) == {"semantic", "visual"}:  # เดาทั้งสองทางแต่ไม่มีคำตรง: ต้องผ่านอย่างน้อยทางหนึ่ง
            return sim["semantic"][pid] >= SEMANTIC_ALONE_MIN or sim["visual"][pid] >= VISUAL_ALONE_MIN
        return True

    fused = [x for x in bm25_rrf.rrf(lists) if keep(x[0], x[2])][:limit]
    return {
        "results": [{"product_id": p, "score": round(s, 5), "via": via} for p, s, via in fused],
        "filters": {k: sorted(v) for k, v in want.items()},
    }


def search_image(img: Image.Image, extra: list[dict], limit: int) -> dict:
    products = {**_visible_products(), **{p["product_id"]: p for p in extra}}
    _, image_extra = _extra_vecs(extra)

    clip = dict(_vector_rank(embedding.clip_images([fabric_region(img)])[0], "image", image_extra, 0.0))
    q = color.palette(img, photo=True)
    scored = []
    for pid, p in products.items():
        pal = _palette(swatch_url(p))
        if pal is None:
            continue
        c = clip.get(pid, 0.0)
        score = color.similarity(q, pal) + PATTERN_WEIGHT * max(0.0, c - PATTERN_FROM)
        if score >= IMAGE_SCORE_MIN:
            scored.append((pid, score, ["pattern"] if c >= PATTERN_LABEL else ["color"]))
    scored.sort(key=lambda x: -x[1])
    return {"results": [{"product_id": p, "score": round(s, 4), "via": via} for p, s, via in scored[:limit]]}
