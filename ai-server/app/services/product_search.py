"""ค้นหาสินค้า (หัวข้อ 2.2–2.3) + สร้างเวกเตอร์ของสินค้าเก็บใน vector_embedding

ข้อความ: BGE-M3 (ความหมาย) + BM25 (คีย์เวิร์ด/รหัส) + คำค้นเชิงโครงสร้าง (LLM Query) + OpenCLIP ข้อความ→รูป → รวมด้วย RRF
รูปภาพ: คะแนน = โทนสีใกล้เคียง + โบนัสเมื่อลายคล้าย (OpenCLIP รูป→รูป)
  ลูกค้าส่วนใหญ่ไม่ได้ถ่ายรูปผ้าเต็มกรอบ จึงไม่ค้นแบบเป๊ะ — ลายไม่ตรงก็ยังได้ผ้าโทนสีใกล้เคียง
  (OpenCLIP แทบไม่สนสี: รูปสีชมพูเรียบได้คะแนนกับผ้ากรมท่าเรียบสูงกว่าผ้าชมพู จึงใช้สีเป็นหลัก ลายเป็นโบนัส)

เวกเตอร์เก็บในคอลัมน์ pgvector ของ Supabase แต่ค้นด้วย numpy ใน ai-server (ดึงมาเก็บในหน่วยความจำ)
เพราะต่อผ่าน Supabase API ที่ใช้คำสั่ง <=> ของ pgvector ไม่ได้ — 1,000 สินค้า (เวกเตอร์ 2,000 แถว) คูณกันใช้ไม่ถึง 1 ms
เวกเตอร์ดึงครั้งเดียวแล้วเก็บไว้ (1,000 สินค้า ~20 MB) ดึงใหม่เมื่อสร้างเวกเตอร์ใหม่ หรือทุก VECTOR_REFRESH วินาที
โทนสีของผ้าคำนวณตอนสร้างเวกเตอร์ + ทยอยคำนวณในเบื้องหลัง เก็บในไฟล์ (palette_store) ค้นด้วยรูปจึงไม่ต้องรอดาวน์โหลดรูปทุกผืน
"""
import functools
import logging
import threading
import time

import numpy as np
from PIL import Image

from app.config import SEARCH_LLM, SEARCH_LLM_TIMEOUT
from app.services import bm25_rrf, color, db, embedding, imageio, palette_store, search_log
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
# คำค้น (ตัด ผ้า/ม่าน ออก) ↔ คำอธิบายลาย/การกรองแสง (bm25_rrf.CONCEPTS): ตรงความหมาย 0.78–1.00 / ไม่เกี่ยว ≤ 0.71
# และต้องชนะความหมายอื่นในกลุ่มเดียวกันชัด ๆ (ตรง: ห่างอันดับสอง ≥ 0.14 / "ผ้าลายจุด": ลายทาง 0.77 vs ตาราง 0.73)
CONCEPT_MIN = 0.75
CONCEPT_MARGIN = 0.08
# ค้นด้วยรูป (วัดจากรูปถ่ายจำลอง: ผ้าบนโต๊ะ/พื้นหลัง แสงไม่สม่ำเสมอ, รูปสีเรียบ เช่น หมอนอิง)
PATTERN_FROM = 0.55  # OpenCLIP เกินนี้ถึงได้โบนัสลาย (ผ้าเรียบกับรูปสีเรียบอะไรก็ได้ ~0.5–0.63)
PATTERN_WEIGHT = 1.2
PATTERN_LABEL = 0.60  # OpenCLIP ตั้งแต่นี้ แสดงว่า "ลายคล้าย" ไม่งั้น "สีใกล้เคียง"
IMAGE_SCORE_MIN = 0.30  # คะแนนรวมต่ำกว่านี้ไม่แสดง (ผ้าที่ตรงได้ ~0.5–1.2)

PRODUCTS_REFRESH = 60  # รายการสินค้า (แอดมินแก้ชื่อ/ราคา/ซ่อนแคตตาล็อก จะเห็นในผลค้นหาภายในเวลานี้)
VECTOR_REFRESH = 30 * 60  # เวกเตอร์ (index_products ล้างทันทีอยู่แล้ว อันนี้เผื่อมีที่อื่นแก้ตาราง)

# ---------- ข้อมูลจาก DB (cache สั้น ๆ; สร้างเวกเตอร์ใหม่แล้วล้างทันที) ----------

_cache: dict = {}
_cache_lock = threading.Lock()


def _cached(key: str, load, ttl: float):
    with _cache_lock:
        hit = _cache.get(key)
        if hit is None or time.time() - hit[0] > ttl:
            hit = (time.time(), load())
            _cache[key] = hit
        return hit[1]


def invalidate():
    with _cache_lock:
        _cache.clear()


def warm_up():
    """ตอนเปิดเซิร์ฟเวอร์: คำนวณโทนสีของผ้าที่ยังไม่มีในเบื้องหลัง (ค้นด้วยรูปครั้งแรกจะได้ไม่ขาด)"""
    try:
        palette_store.warm_in_background([swatch_url(p) for p in _visible_products().values()])
    except Exception:  # noqa: BLE001 — ต่อ DB ไม่ได้ตอนเปิดเครื่องก็ยังเปิดเซิร์ฟเวอร์ได้
        log.exception("warm_up ไม่สำเร็จ")


def _visible_products() -> dict[int, dict]:
    return _cached("products", lambda: {p["product_id"]: p for p in db.products(visible_only=True)}, PRODUCTS_REFRESH)


def _bm25() -> bm25_rrf.BM25:
    """ดัชนี BM25 สร้างครั้งเดียวต่อรอบรายการสินค้า (1,000 สินค้า ~90 ms ไม่ต้องสร้างทุกครั้งที่ค้น)"""
    products = _visible_products()
    docs = lambda: bm25_rrf.BM25({pid: bm25_rrf.product_text(p) for pid, p in products.items()})  # noqa: E731
    return _cached(f"bm25:{id(products)}", docs, PRODUCTS_REFRESH)


def _vectors(kind: str) -> tuple[np.ndarray, np.ndarray]:
    return _cached(f"vec:{kind}", lambda: db.embeddings(kind), VECTOR_REFRESH)


def swatch_url(p: dict) -> str | None:
    images = (p.get("details") or {}).get("images") or []
    return images[0] if images else p.get("image_url")


# ---------- สร้างเวกเตอร์ของสินค้า ----------


def _load_swatch(url: str | None) -> Image.Image | None:
    if not url:
        return None
    try:
        return fabric_region(imageio.load_url(url, 1024))
    except ValueError as e:  # รูปไม่ได้อยู่ใน storage ของร้าน / โหลดไม่ได้
        log.warning("ข้ามรูป %s: %s", url, e)
        return None


BATCH = 50  # บันทึกทีละชุด: งานใหญ่ (เป็นพันรายการ) หยุดกลางทางก็ไม่เสียของที่ทำไปแล้ว


def index_products(ids: list[int] | None, on_progress=None) -> dict:
    """สร้างเวกเตอร์ข้อความ (BGE-M3) + รูป (OpenCLIP) ใหม่ แล้วแทนที่ของเดิมใน vector_embedding (+ เก็บโทนสีลง palette_store)
    ids=None = ทุกสินค้า, on_progress(ทำแล้ว, ทั้งหมด)"""
    rows = db.products(ids)
    skipped: list[int] = []
    for start in range(0, len(rows), BATCH):
        batch = rows[start : start + BATCH]
        text_vecs = embedding.text([bm25_rrf.product_text(r) for r in batch])
        inserts = []
        for r, tv in zip(batch, text_vecs):
            pid = r["product_id"]
            inserts.append({"product_id": pid, "embedding_type": "text", "vector_data": embedding.to_pg(tv)})
            img = _load_swatch(swatch_url(r))
            if img is None:
                skipped.append(pid)
                continue
            iv = embedding.clip_images([img])[0]
            palette_store.put(swatch_url(r), color.palette(img))
            inserts.append({"product_id": pid, "embedding_type": "image", "vector_data": embedding.to_pg(iv)})
        db.replace_embeddings([r["product_id"] for r in batch], inserts)
        if on_progress:
            on_progress(start + len(batch), len(rows))
    palette_store.flush()
    invalidate()
    return {"products": len(rows), "text": len(rows), "image": len(rows) - len(skipped), "image_skipped": skipped}


# ---------- ค้นหา ----------


def _vector_rank(vec: np.ndarray, kind: str, visible: dict[int, dict], minimum: float) -> list[tuple[int, float]]:
    """สินค้าที่มองเห็นได้ เรียงตามความคล้าย (cosine — เวกเตอร์ normalize แล้ว จึงเป็น dot product)"""
    ids, mat = _vectors(kind)
    sims: dict[int, float] = {}
    for pid, s in zip(ids.tolist(), (mat @ vec).tolist()):
        if pid in visible and s >= minimum and s > sims.get(pid, -1.0):
            sims[pid] = s
    return sorted(sims.items(), key=lambda x: -x[1])


def _concept_vectors() -> list[tuple[str, str, np.ndarray]]:
    """[(kind, value, เวกเตอร์ของวลี)] คำนวณครั้งเดียว"""

    def load():
        rows = [(k, v, ph) for k, vals in bm25_rrf.CONCEPTS.items() for v, phrases in vals.items() for ph in phrases]
        vecs = embedding.text([ph for *_, ph in rows])
        return [(k, v, vec) for (k, v, _), vec in zip(rows, vecs)]

    return _cached("concepts", load, float("inf"))


def _concept_extract(q: str) -> dict[str, set[str]]:
    """เทียบความหมายคำค้นกับคำอธิบายลาย/การกรองแสง ใช้เมื่อไม่เจอคำในรายการ — ได้ไม่เกินกลุ่มละ 1 ค่า
    ตัดคำว่า ผ้า/ม่าน ออกก่อน และคำค้นหลายท่อน (เว้นวรรค) เทียบทั้งประโยคและทีละท่อน เพราะประโยคยาวความหมายเจือจาง"""
    out: dict[str, set[str]] = {"patterns": set(), "lights": set()}
    texts = list(dict.fromkeys(t for t in (bm25_rrf.FABRIC_WORDS.sub(" ", s).strip() for s in [q, *q.split()]) if t))
    if not texts:
        return out
    vecs = embedding.text(texts)
    best: dict[tuple[str, str], float] = {}
    for kind, v, cv in _concept_vectors():
        best[kind, v] = max(best.get((kind, v), -1.0), float((vecs @ cv).max()))
    for kind in out:
        ranked = sorted(((s, v) for (k, v), s in best.items() if k == kind), reverse=True)
        (s1, v1), (s2, _) = ranked[0], ranked[1]
        if s1 >= CONCEPT_MIN and s1 - s2 >= CONCEPT_MARGIN:
            out[kind].add(v1)
    return out


LLM_QUERY_PROMPT = """Extract curtain-fabric search filters from a Thai/English shop search query.
Return only JSON: {"colors": [...], "patterns": [...], "lights": [...]}
- colors: Thai color words the customer wants, e.g. ขาว ครีม เทา น้ำเงิน (empty if none)
- patterns: any of plain (เรียบ/สีพื้น), texture (เท็กซ์เจอร์), stripe (ลายทาง/ริ้ว), floral (ดอกไม้),
  geometric (ตาราง/หมากรุก/สก็อต/เรขาคณิต), damask (ดามัสก์/หรูหราคลาสสิก), botanical (ใบไม้/ต้นไม้), kids (การ์ตูน/ห้องเด็ก)
- lights: any of sheer (see-through), dimout (filters some light), blackout (blocks light/heat)
Use only what the query asks for; leave a list empty when unsure. Ignore price words.
Examples:
"ผ้าม่านสีขาวเย็นสบาย" -> {"colors": ["ขาว"], "patterns": [], "lights": ["dimout", "blackout"]}
"ม่านลายดอกไม้โทนชมพู โปร่งๆ" -> {"colors": ["ชมพู"], "patterns": ["floral"], "lights": ["sheer"]}
"ผ้าห้องนอนเด็ก นอนกลางวันได้" -> {"colors": [], "patterns": ["kids"], "lights": ["blackout"]}
Query: """
LLM_KINDS = {
    "patterns": set(bm25_rrf.PATTERNS.values()),
    "lights": set(bm25_rrf.LIGHTS.values()),
}


@functools.lru_cache(maxsize=512)
def _llm_query(q: str) -> tuple[tuple[str, tuple[str, ...]], ...]:
    """LLM Query: คำค้นภาษาธรรมชาติ → เงื่อนไขเชิงโครงสร้าง (JSON)
    เก็บผลตามคำค้น (คำค้นซ้ำ ๆ เช่น "ผ้าม่านทึบแสง" ไม่ต้องรอ LLM ใหม่) — เรียกไม่สำเร็จจะ raise จึงไม่ถูกเก็บ"""
    from app.services import vlm

    res = vlm._client.chat.completions.create(
        model=vlm.VLM_MODEL,
        temperature=0,
        timeout=SEARCH_LLM_TIMEOUT,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": LLM_QUERY_PROMPT + q}],
    )
    out = vlm.parse_json(res.choices[0].message.content or "")
    return tuple((k, tuple(str(v).strip().lower() for v in out.get(k) or [])) for k in ("colors", "patterns", "lights"))


def _llm_extract(q: str, known_colors: set[str]) -> dict[str, set[str]] | None:
    """ผลจาก LLM เฉพาะค่าที่ระบบรู้จัก (กัน LLM ตอบค่าที่ไม่มีในข้อมูลสินค้า แล้วไปตัดสินค้าทิ้งหมด) / None = เรียก LLM ไม่ได้"""
    try:
        out = _llm_query(q)
    except Exception:  # noqa: BLE001 — LLM ใช้ไม่ได้ก็ยังค้นด้วยคลังคำ/การเทียบความหมายได้
        log.exception("LLM สกัดคำค้นไม่สำเร็จ")
        return None
    colors = {c.lower() for c in [*bm25_rrf.COLORS, *known_colors]}
    allowed = {"colors": colors, **LLM_KINDS}
    return {k: {v for v in vals if v in allowed[k]} for k, vals in out}


def search_text(q: str, limit: int) -> dict:
    products = _visible_products()
    typed = q  # คำที่ลูกค้าพิมพ์ (บันทึกลง search_log)

    # เรื่องราคาไม่ใช่คำบรรยายสินค้า: ตัดออกก่อนค้น แล้วใช้กรอง/เรียงทีหลัง
    cheap, max_price, q = bm25_rrf.price_intent(q)
    q = bm25_rrf.expand(q)
    # เหลือแค่ "ม่าน"/"ผ้าม่าน" (เช่น "ม่านราคาถูก") = ดูสินค้าทั้งหมด ตามเงื่อนไขที่เหลือ
    browse = not bm25_rrf.FABRIC_WORDS.sub(" ", q).strip()

    colors = {c for p in products.values() for c in ((p.get("details") or {}).get("colors") or [])}
    # คำค้นเชิงโครงสร้าง (LLM Query): LLM สกัดเงื่อนไขจากคำค้น รวมกับคำที่ตรงในคลังคำ (เช่น "ทึบแสง", หมวดผ้า/อุปกรณ์)
    # และการเทียบความหมายด้วย BGE-M3 — LLM ขนาดเล็กยังตอบพลาดบ้าง (เช่น "ลายมอนสเตอร่า" → ดอกไม้) จึงใช้ร่วมกัน ไม่แทนกัน
    # และถ้าเรียก LLM ไม่ได้ก็ยังค้นได้
    want = bm25_rrf.extract(q, colors)
    by_meaning = []  # เงื่อนไขที่คลังคำจับไม่ได้ แต่ได้จากการเทียบความหมาย / LLM (เอาไปเพิ่มคำในคลังคำ)
    for kind, found in ({} if browse else _concept_extract(q)).items():
        if found and not want[kind]:
            want[kind] = found
            want["category"] = want["category"] or {"fabric"}
            by_meaning.append(kind)
    for kind, found in ((_llm_extract(q, colors) or {}) if SEARCH_LLM and not browse else {}).items():
        if found - want[kind]:
            if not want[kind]:
                by_meaning.append(kind)
            want[kind] |= found
            want["category"] = want["category"] or {"fabric"}

    structured = bm25_rrf.structured_rank(want, products)
    if browse:
        fused = [(pid, 0.0, ["browse"]) for pid in products]
    else:
        fused = _fuse(q, products, structured)
    fused = [x for x in fused if not bm25_rrf.contradicts(want, products[x[0]])]
    notice = None
    if max_price is not None:
        prices = [products[x[0]]["base_price"] for x in fused if products[x[0]].get("base_price") is not None]
        fused = [x for x in fused if _within(products[x[0]], max_price)]
        if not fused and prices:
            notice = f"ไม่มีสินค้าที่ตรงและราคาไม่เกิน {max_price:,.0f} บาท (ราคาเริ่มต้น {min(prices):,.0f} บาท)"
    # ตรงเงื่อนไขที่สกัดได้มากกว่า (สีตรงเป๊ะ > สีใกล้เคียง) ขึ้นก่อนเสมอ แล้วค่อยเรียงตามความเกี่ยวข้อง / ราคา
    level = dict(structured)
    price = lambda pid: products[pid].get("base_price") or float("inf")  # noqa: E731
    fused.sort(key=lambda x: (-level.get(x[0], 0.0), price(x[0]) if cheap else -x[1]))
    fused = fused[:limit]

    search_log.record(typed, len(fused), want, by_meaning)
    filters = {k: sorted(v) for k, v in want.items()}
    filters["price"] = (["cheap"] if cheap else []) + ([f"max:{max_price:g}"] if max_price is not None else [])
    return {
        "results": [{"product_id": p, "score": round(s, 5), "via": via} for p, s, via in fused],
        "filters": filters,
        "notice": notice,
    }


def _within(p: dict, max_price: float | None) -> bool:
    return max_price is None or (p.get("base_price") is not None and p["base_price"] <= max_price)


def _fuse(q: str, products: dict[int, dict], structured: list[tuple[int, float]]) -> list[tuple[int, float, list[str]]]:
    """BM25 + BGE-M3 + เงื่อนไขที่สกัดได้ + OpenCLIP → RRF (ตัดสินค้าที่เจอจากการเดาความหมายทางเดียวแต่ไม่คล้ายพอ)"""
    lists = {
        "keyword": _bm25().rank(q),
        "semantic": _vector_rank(embedding.text([q])[0], "text", products, TEXT_MIN),
        "structured": structured,
        "visual": _vector_rank(embedding.clip_texts([q])[0], "image", products, CLIP_TEXT_MIN),
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

    return [x for x in bm25_rrf.rrf(lists) if keep(x[0], x[2])]


def search_image(img: Image.Image, limit: int) -> dict:
    products = _visible_products()
    clip = dict(_vector_rank(embedding.clip_images([fabric_region(img)])[0], "image", products, 0.0))
    q = color.palette(img, photo=True)
    urls = {pid: swatch_url(p) for pid, p in products.items()}
    missing = [u for u in urls.values() if u and palette_store.get(u) is None]
    if missing:  # ยังคำนวณโทนสีไม่ครบ (เพิ่งเปิดเซิร์ฟเวอร์/เพิ่งเพิ่มสินค้า) → ทำในเบื้องหลัง รอบนี้ใช้เท่าที่มี
        palette_store.warm_in_background(missing)
    scored = []
    for pid in products:
        pal = palette_store.get(urls[pid])  # สินค้าที่ไม่มีรูปก็ไม่มีโทนสี จึงไม่อยู่ในผลค้นด้วยรูป
        if pal is None or not len(pal):
            continue
        c = clip.get(pid, 0.0)
        score = color.similarity(q, pal) + PATTERN_WEIGHT * max(0.0, c - PATTERN_FROM)
        if score >= IMAGE_SCORE_MIN:
            scored.append((pid, score, ["pattern"] if c >= PATTERN_LABEL else ["color"]))
    scored.sort(key=lambda x: -x[1])
    return {"results": [{"product_id": p, "score": round(s, 4), "via": via} for p, s, via in scored[:limit]]}
