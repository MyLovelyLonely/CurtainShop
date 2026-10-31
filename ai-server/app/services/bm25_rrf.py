"""BM25 (ค้นด้วยคีย์เวิร์ด) + คำค้นเชิงโครงสร้าง + RRF (รวมอันดับจากหลายวิธีค้นหา)

BM25 ทำในโปรแกรมแทน full-text search ของ PostgreSQL เพราะ Postgres ตัดคำภาษาไทยไม่ได้ (ภาษาไทยไม่เว้นวรรค)
จึงแบ่งข้อความภาษาไทยเป็นช่วงตัวอักษร 2–3 ตัว (n-gram) ส่วนภาษาอังกฤษ/ตัวเลข/รหัสสินค้าใช้ทั้งคำ
"""
import math
import re
from collections import Counter

# ตรงกับ LIGHT_FILTERS ใน web/src/types/catalog.ts
LIGHT_LABELS = {"sheer": "โปร่งแสง sheer", "dimout": "กรองแสงบางส่วน dim-out", "blackout": "ทึบแสง กันแสง blackout"}
# composition เขียนเป็นภาษาอังกฤษ (เช่น "Polyester 100%") แต่ลูกค้าพิมพ์ภาษาไทย
MATERIALS_TH = {
    "polyester": "โพลีเอสเตอร์", "cotton": "ฝ้าย คอตตอน", "linen": "ลินิน", "voile": "โวล",
    "jacquard": "แจ็คการ์ด", "velvet": "กำมะหยี่", "silk": "ไหม", "rayon": "เรยอน",
}


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
        " ".join(th for en, th in MATERIALS_TH.items() if en in (d.get("composition") or "").lower()),
        LIGHT_LABELS.get(d.get("light_filter") or ""),
        " ".join(d.get("tags") or []),
        p.get("catalog_name"),
        p.get("category_name"),
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
# คำเรียกโทนสี → สีที่อยู่ในโทนนั้น
EARTH = ["น้ำตาล", "เบจ", "ครีม", "ส้ม"]
WARM = ["แดง", "ส้ม", "เหลือง", "น้ำตาล", "ครีม"]
COOL = ["ฟ้า", "น้ำเงิน", "เขียว", "เทา", "ม่วง"]
DARK = ["ดำ", "เทาเข้ม", "เทาชาร์โคล", "กรมท่า", "น้ำตาล", "มอคค่า", "เขียวเข้ม", "เขียวมะกอก", "แดงเลือดหมู", "ม่วง"]
COLOR_GROUPS = {
    "เอิร์ธโทน": EARTH, "เอิธโทน": EARTH, "earth tone": EARTH, "โทนธรรมชาติ": EARTH,
    "โทนอบอุ่น": WARM, "โทนร้อน": WARM, "โทนเย็น": COOL,
    "สีเข้ม": DARK, "โทนเข้ม": DARK, "dark": DARK,
    "น้ำเงินเข้ม": ["กรมท่า"],
}

# คำค้น → คำที่อยู่ใน pattern_type (ดู PATTERN_TYPES ใน web/src/types/catalog.ts)
PATTERNS = {
    "เรียบ": "plain", "plain": "plain",
    "เท็กซ์เจอร์": "texture", "texture": "texture",
    "ลายทาง": "stripe", "ริ้ว": "stripe", "stripe": "stripe",
    "ดอก": "floral", "floral": "floral",
    "เรขาคณิต": "geometric", "ตาราง": "geometric", "สก็อต": "geometric", "geometric": "geometric", "check": "geometric",
    "ดามัสก์": "damask", "damask": "damask",
    "ใบไม้": "botanical", "botanical": "botanical", "leaf": "botanical",
    "เด็ก": "kids", "การ์ตูน": "kids", "kids": "kids",
}
# "มีลาย" = ทุกลายที่ไม่ใช่ผ้าเรียบ/เท็กซ์เจอร์, "ไม่มีลาย" = ผ้าเรียบ (ตรวจคำปฏิเสธก่อน เพราะ "ไม่มีลาย" มีคำว่า "มีลาย" อยู่ข้างใน)
PATTERNED = {"stripe", "floral", "geometric", "damask", "botanical", "kids"}
PLAIN_WORDS = ["ไม่มีลาย", "ไม่เอาลาย", "สีพื้น", "ผ้าพื้น"]
PATTERNED_WORDS = ["มีลาย", "ลวดลาย", "ลายๆ", "ลาย ๆ", "patterned"]

# อุปกรณ์ (หมวดที่ชื่อมีคำว่า "อุปกรณ์") — ค้น "รางม่าน" ไม่เอาผ้า, ค้นผ้าไม่เอาอุปกรณ์
ACCESSORY_WORDS = ["ราง", "ราว", "ตะขอ", "สายรวบ", "ที่รวบ", "มอเตอร์", "รีโมท", "อุปกรณ์", "ขายึด", "รอก"]
FABRIC_WORDS = re.compile(r"ผ้าม่าน|ผ้า|ม่าน")
# "ผ้า" ที่ไม่ใช่ส่วนหนึ่งของ "ผ้าม่าน" (เช่น "ตะขอผ้าม่าน" ยังเป็นอุปกรณ์ แต่ "ผ้าโปร่ง" เป็นผ้า)
FABRIC_ONLY = re.compile(r"ผ้า(?!ม่าน)")

LIGHTS = {
    "ทึบ": "blackout", "กันแสง": "blackout", "กันแดด": "blackout", "blackout": "blackout", "มืด": "blackout",
    "กรองแสง": "dimout", "dimout": "dimout", "dim-out": "dimout",
    "ดิมเอาท์": "dimout", "ดิมเอ้าท์": "dimout", "ดิมเอาต์": "dimout", "ดิมเอ้าต์": "dimout",
    "โปร่ง": "sheer", "sheer": "sheer", "ซีทรู": "sheer",
}


# คำอธิบายของแต่ละลาย/การกรองแสง ใช้เทียบความหมายกับคำค้นด้วย BGE-M3 (product_search.CONCEPT_MIN)
# จับคำที่ไม่อยู่ในรายการข้างบน เช่น "ลายหมากรุก" → geometric, "ผ้าบางๆ แสงลอดได้" → sheer, "หรูๆ สไตล์ยุโรป" → damask
# วลีต้องเจาะจง และไม่มีคำว่า ผ้า/ม่าน (ไม่งั้นไปคล้ายกับทุกคำค้นที่ขึ้นต้นด้วย "ผ้า..." เช่น "ผ้าซักง่าย")
CONCEPTS = {
    "patterns": {
        "stripe": ["ลายทาง", "ลายเส้น", "ลายริ้ว", "ลายขวาง", "ลายแถบ", "stripes"],
        "floral": ["ลายดอกไม้", "ลายดอกกุหลาบ", "ลายพฤกษา", "floral print"],
        "geometric": ["ลายตาราง", "ลายหมากรุก", "ลายสก็อต", "ลายเรขาคณิต", "ลายสามเหลี่ยม", "plaid check"],
        "damask": ["ลายดามัสก์", "ลายหรูหรา สไตล์ยุโรปคลาสสิก", "ลายวินเทจ", "ลายวิจิตร"],
        "botanical": ["ลายใบไม้", "ลายต้นไม้", "ลายทรอปิคอล", "ลายมอนสเตอร่า"],
        "kids": ["ลายการ์ตูน", "ลายสำหรับห้องเด็ก", "ลายน่ารัก", "ลายสัตว์"],
        "plain": ["สีพื้นเรียบ", "เรียบไม่มีลาย", "มินิมอล"],
    },
    "lights": {
        "sheer": ["โปร่งบาง แสงลอดผ่านได้", "บางใส ซีทรู"],
        "dimout": ["กรองแสงบางส่วน", "ลดแสง ไม่มืดสนิท"],
        "blackout": ["ทึบแสง กันแสงได้หมด", "ห้องมืดสนิท", "บังแดด กันความร้อน"],
    },
}


# "ไม่มืดมาก" / "ไม่ทึบ" / "ไม่ต้องกันแสง" = ไม่เอาแบบนั้น (ถ้าไม่ได้ระบุแบบอื่น ก็เอาแบบที่เหลือ)
NEGATED_LIGHT = re.compile(
    r"ไม่(?:ค่อย|ต้อง|อยาก|เอา)?\s*(?:" + "|".join(sorted(map(re.escape, LIGHTS), key=len, reverse=True)) + ")"
)

CHEAP_WORDS = ["ราคาถูก", "ราคาไม่แพง", "ไม่แพง", "ถูกที่สุด", "ถูกๆ", "ถูก ๆ", "ราคาประหยัด", "ประหยัด", "งบน้อย", "cheap"]
MAX_PRICE = re.compile(r"(?:ราคา)?\s*(?:ไม่เกิน|ต่ำกว่า|น้อยกว่า|ไม่ถึง|งบ|under|below|<)\s*(\d[\d,]*)\s*(?:บาท|฿|baht)?")


def price_intent(q: str) -> tuple[bool, float | None, str]:
    """→ (อยากได้ของถูก, ราคาสูงสุด, คำค้นที่เหลือหลังตัดเรื่องราคา) เช่น "ม่านทึบแสง ไม่เกิน 500 บาท" → (False, 500, "ม่านทึบแสง")"""
    ql = q.lower()
    m = MAX_PRICE.search(ql)
    max_price = float(m.group(1).replace(",", "")) if m else None
    if m:
        ql = ql[: m.start()] + " " + ql[m.end() :]
    cheap = any(w in ql for w in CHEAP_WORDS)
    for w in CHEAP_WORDS:
        ql = ql.replace(w, " ")
    return cheap, max_price, " ".join(ql.split())


# คำที่มีชื่อสีปนอยู่แต่ไม่ได้หมายถึงสี
NOT_COLOR = ["ฟอกขาว", "ขาวดำ", "ไฟฟ้า"]

# คำที่ลูกค้าใช้ แต่ข้อมูลสินค้าเขียนอีกแบบ → เติมคำในข้อมูลเข้าไปในคำค้น
# "สีทึบ" / "สีมืด" = สีเข้ม ไม่ใช่ผ้าทึบแสง — เปลี่ยนคำก่อนค้น (ไม่งั้น "ทึบ"/"มืด" ไปตรงกับคำเรื่องการกรองแสง)
REWRITE = {"สีทึบ": "สีเข้ม", "โทนทึบ": "โทนเข้ม", "สีมืด": "สีเข้ม", "โทนมืด": "โทนเข้ม"}
SYNONYMS = {"ซักง่าย": "ซักเครื่องได้", "ดูแลง่าย": "ซักเครื่องได้", "ซักเครื่องซักผ้า": "ซักเครื่องได้"}


def expand(q: str) -> str:
    for k, v in REWRITE.items():
        q = q.replace(k, v)
    return " ".join([q, *(v for k, v in SYNONYMS.items() if k in q and v not in q)])


def extract(q: str, extra_colors: set[str] = frozenset()) -> dict:
    """คำค้น → {colors, patterns, lights, category} (เช่น "ผ้าม่านสีขาวเย็นสบาย" → colors={ขาว}, category={fabric})"""
    ql = q.lower()
    for w in NOT_COLOR:
        ql = ql.replace(w, " ")
    negated = {v for m in NEGATED_LIGHT.finditer(ql) for k, v in LIGHTS.items() if k in m.group()}
    ql = NEGATED_LIGHT.sub(" ", ql)
    found = {c for c in set(COLORS) | set(extra_colors) if c and c.lower() in ql}
    group = {c for k, cs in COLOR_GROUPS.items() if k in ql for c in cs}
    patterns = {v for k, v in PATTERNS.items() if k in ql}
    if any(w in ql for w in PLAIN_WORDS):
        patterns.add("plain")
    elif any(w in ql for w in PATTERNED_WORDS) and not patterns - {"plain"}:
        patterns = set(PATTERNED)  # ไม่ได้ระบุลายเจาะจง → ลายอะไรก็ได้
    lights = {v for k, v in LIGHTS.items() if k in ql}
    if not lights and negated:
        lights = {"sheer", "dimout", "blackout"} - negated
    if any(w in ql for w in ACCESSORY_WORDS) and not (patterns or lights or FABRIC_ONLY.search(ql)):
        category = {"accessory"}
    elif FABRIC_WORDS.search(ql) or patterns or lights:
        category = {"fabric"}
    else:
        category = set()
    return {
        # คำที่อยู่ในคำที่ยาวกว่าไม่นับ เช่น "น้ำเงิน" ไม่ใช่ "เงิน"
        "colors": {c for c in found if not any(c != o and c in o for o in found)} | group,
        "patterns": patterns,
        "lights": lights,
        "category": category,
    }


def contradicts(want: dict, p: dict) -> bool:
    """สินค้าขัดกับเงื่อนไขลาย/การกรองแสงที่คำค้นระบุชัด เช่น ค้น "มีลาย" ไม่เอาผ้าเรียบ, ค้น "กันแสง" ไม่เอาผ้าโปร่ง
    - ระบุลาย: สินค้าที่ไม่มีประเภทลาย (ส่วนใหญ่เป็นอุปกรณ์ เช่น ราง ตะขอ) ก็ตัดออก
    - ระบุการกรองแสง: สินค้าที่ไม่ได้กรอกช่องนี้ยังเก็บไว้ (ชื่ออาจบอกอยู่แล้ว เช่น "ผ้าม่านกันแสง")
    - ระบุหมวด: ค้นอุปกรณ์ไม่เอาผ้า ค้นผ้าไม่เอาอุปกรณ์
    สีไม่ใช้ตัด เพราะมีสีใกล้เคียง/สีจากรูปช่วยหา"""
    accessory = "อุปกรณ์" in (p.get("category_name") or "")
    if want.get("category") and accessory != ("accessory" in want["category"]):
        return True
    d = p.get("details") or {}
    pattern = (d.get("pattern_type") or "").lower()
    if want["patterns"] and not any(k in pattern for k in want["patterns"]):
        return True
    light = d.get("light_filter")
    return bool(want["lights"] and light and light not in want["lights"])


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
