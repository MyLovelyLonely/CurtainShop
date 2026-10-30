"""BM25 (ค้นด้วยคีย์เวิร์ด) + คำค้นเชิงโครงสร้าง + RRF (รวมอันดับจากหลายวิธีค้นหา)

BM25 ทำในโปรแกรมแทน full-text search ของ PostgreSQL เพราะ Postgres ตัดคำภาษาไทยไม่ได้ (ภาษาไทยไม่เว้นวรรค)
จึงแบ่งข้อความภาษาไทยเป็นช่วงตัวอักษร 2–3 ตัว (n-gram) ส่วนภาษาอังกฤษ/ตัวเลข/รหัสสินค้าใช้ทั้งคำ
"""
import math
import re
from collections import Counter

# ตรงกับ LIGHT_FILTERS ใน web/src/types/catalog.ts
LIGHT_LABELS = {"sheer": "โปร่งแสง sheer", "dimout": "กรองแสงบางส่วน dim-out", "blackout": "ทึบแสง กันแสง blackout"}


def product_text(p: dict) -> str:
    """ข้อความของสินค้าที่ใช้สร้าง embedding และทำดัชนี BM25"""
    d = p.get("details") or {}
    desc = p.get("description")
    width = d.get("width_cm")
    parts = [
        p.get("name"),
        d.get("code"),
        d.get("collection"),
        d.get("pattern_name"),
        d.get("pattern_type"),
        " ".join(d.get("colors") or []),
        d.get("composition"),
        LIGHT_LABELS.get(d.get("light_filter") or ""),
        " ".join(d.get("tags") or []),
        p.get("catalog_name"),
        desc if isinstance(desc, str) else None,
        d.get("care"),  # วิธีดูแลรักษา เช่น ซักมือ/ซักเครื่อง
        f"หน้ากว้าง {width:g} ซม." if isinstance(width, (int, float)) else None,
    ]
    return " | ".join(str(x) for x in parts if x)


# ---------- BM25 ----------


def tokens(s: str) -> list[str]:
    s = s.lower()
    out: list[str] = []
    for m in re.finditer(r"[a-z0-9]+|[฀-๿]+", s):
        w = m.group()
        if w[0] < "฀":
            out.append(w)
        else:  # ภาษาไทย → n-gram 2–3 ตัวอักษร
            grams = [w[i : i + 2] for i in range(len(w) - 1)] + [w[i : i + 3] for i in range(len(w) - 2)]
            out += grams or [w]
    # รหัสสินค้าที่มีขีด/จุด เช่น BK-101 → bk101 (พิมพ์ติดกันก็เจอ)
    out += [re.sub(r"[^a-z0-9]", "", c) for c in re.findall(r"[a-z]+[-_./ ]?\d+[a-z0-9]*", s)]
    return out


class BM25:
    def __init__(self, docs: dict[int, str], k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.tf = {i: Counter(tokens(t)) for i, t in docs.items()}
        self.len = {i: sum(c.values()) for i, c in self.tf.items()}
        self.avg = sum(self.len.values()) / max(1, len(self.len))
        df = Counter(t for c in self.tf.values() for t in c)
        n = len(self.tf)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def rank(self, q: str, min_coverage: float = 0.5) -> list[tuple[int, float]]:
        """min_coverage = สัดส่วนชิ้นคำของคำค้นที่ต้องเจอในสินค้า (กัน n-gram สั้น ๆ อย่าง "สี" จับทุกสินค้า)"""
        qt = set(tokens(q))
        scores = {}
        for i, tf in self.tf.items():
            s, hit = 0.0, 0
            for t in qt:
                f = tf.get(t)
                if f:
                    hit += 1
                    s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * self.len[i] / self.avg))
            if s > 0 and hit >= min_coverage * len(qt):
                scores[i] = s
        return sorted(scores.items(), key=lambda x: -x[1])


# ---------- คำค้นเชิงโครงสร้าง: สกัดสี / ประเภทลาย / การกรองแสงจากคำค้น ----------

COLORS = [
    "ขาว", "ดำ", "เทา", "ครีม", "เบจ", "น้ำตาล", "แดง", "ชมพู", "ส้ม", "เหลือง", "เขียว", "ฟ้า", "น้ำเงิน",
    "กรมท่า", "ม่วง", "ทอง", "เงิน", "white", "black", "grey", "gray", "cream", "beige", "brown", "red",
    "pink", "orange", "yellow", "green", "blue", "navy", "purple", "gold", "silver",
]
# สีใกล้เคียง: ค้น "น้ำเงิน" ก็ได้ผ้าฟ้า/กรมท่าด้วย (น้ำหนักครึ่งหนึ่งของสีที่ตรง)
COLOR_NEIGHBORS = {
    "น้ำเงิน": ["ฟ้า", "กรมท่า"], "ฟ้า": ["น้ำเงิน"], "กรมท่า": ["น้ำเงิน"],
    "ขาว": ["ครีม"], "ครีม": ["เบจ", "ขาว"], "เบจ": ["ครีม", "น้ำตาล"], "น้ำตาล": ["เบจ"],
    "เทา": ["เงิน", "ดำ"], "เงิน": ["เทา"], "ดำ": ["เทา"],
    "ชมพู": ["แดง", "ม่วง"], "แดง": ["ชมพู"], "ม่วง": ["ชมพู"],
    "เหลือง": ["ทอง", "ส้ม"], "ทอง": ["เหลือง", "ครีม"], "ส้ม": ["เหลือง"],
}

# คำค้น → คำที่อยู่ใน pattern_type (ดู PATTERN_TYPES ใน web/src/types/catalog.ts)
PATTERNS = {
    "เรียบ": "plain", "plain": "plain",
    "เท็กซ์เจอร์": "texture", "texture": "texture", "ลินิน": "texture",
    "ลายทาง": "stripe", "ริ้ว": "stripe", "stripe": "stripe",
    "ดอก": "floral", "floral": "floral",
    "เรขาคณิต": "geometric", "ตาราง": "geometric", "สก็อต": "geometric", "geometric": "geometric", "check": "geometric",
    "ดามัสก์": "damask", "damask": "damask",
    "ใบไม้": "botanical", "botanical": "botanical", "leaf": "botanical",
    "เด็ก": "kids", "การ์ตูน": "kids", "kids": "kids",
}
LIGHTS = {
    "ทึบแสง": "blackout", "กันแสง": "blackout", "กันแดด": "blackout", "blackout": "blackout", "มืด": "blackout",
    "กรองแสง": "dimout", "dimout": "dimout", "dim-out": "dimout",
    "โปร่ง": "sheer", "sheer": "sheer", "ซีทรู": "sheer",
}


# คำที่มีชื่อสีปนอยู่แต่ไม่ได้หมายถึงสี
NOT_COLOR = ["ฟอกขาว", "ขาวดำ"]


def extract(q: str, extra_colors: set[str] = frozenset()) -> dict:
    """คำค้น → {colors, patterns, lights} (เช่น "ผ้าม่านสีขาวเย็นสบาย" → colors={ขาว})"""
    ql = q.lower()
    for w in NOT_COLOR:
        ql = ql.replace(w, " ")
    found = {c for c in set(COLORS) | set(extra_colors) if c and c.lower() in ql}
    return {
        # คำที่อยู่ในคำที่ยาวกว่าไม่นับ เช่น "น้ำเงิน" ไม่ใช่ "เงิน"
        "colors": {c for c in found if not any(c != o and c in o for o in found)},
        "patterns": {v for k, v in PATTERNS.items() if k in ql},
        "lights": {v for k, v in LIGHTS.items() if k in ql},
    }


def structured_rank(want: dict, products: dict[int, dict]) -> list[tuple[int, float]]:
    """สินค้าที่ตรงเงื่อนไขที่สกัดได้ เรียงตามจำนวนเงื่อนไขที่ตรง"""
    if not any(want.values()):
        return []
    out = []
    for pid, p in products.items():
        d = p.get("details") or {}
        # สีของสินค้าเป็นคำทั้งคำ (สีในชื่อสินค้าสกัดด้วยกติกาเดียวกับคำค้น) — "เงิน" จึงไม่ตรงกับ "น้ำเงิน"
        colors = {c.lower() for c in d.get("colors") or []} | {c.lower() for c in extract(p.get("name") or "")["colors"]}
        pattern = (d.get("pattern_type") or "").lower()
        n = sum(1.0 if c.lower() in colors else 0.5 * any(x in colors for x in COLOR_NEIGHBORS.get(c, [])) for c in want["colors"])
        n += sum(k in pattern for k in want["patterns"])
        n += sum(d.get("light_filter") == k for k in want["lights"])
        if n:
            out.append((pid, float(n)))  # เรียงตามจำนวนเงื่อนไขที่ตรง (สีใกล้เคียงนับครึ่ง)
    return sorted(out, key=lambda x: -x[1])


# ---------- RRF ----------


def rrf(lists: dict[str, list[tuple[int, float]]], k: int = 60) -> list[tuple[int, float, list[str]]]:
    """รวมอันดับ: คะแนน = Σ 1/(k + อันดับ) สินค้าที่ติดอันดับดีหลายวิธีได้คะแนนสูง → [(id, score, [วิธีที่เจอ])]"""
    score: dict[int, float] = {}
    via: dict[int, list[str]] = {}
    for name, ranked in lists.items():
        for rank, (pid, _) in enumerate(ranked, 1):
            score[pid] = score.get(pid, 0.0) + 1 / (k + rank)
            via.setdefault(pid, []).append(name)
    return sorted(((p, s, via[p]) for p, s in score.items()), key=lambda x: -x[1])
