"""แคตตาล็อก → สินค้า: PaddleOCR อ่านข้อความ + Qwen2.5-VL จัดกลุ่ม (ข้อมูลร่วมของหน้า / ข้อมูลเฉพาะแต่ละลาย)"""
import io
import re
import uuid

import httpx
from PIL import Image

from app.config import SUPABASE_BUCKET, SUPABASE_KEY, SUPABASE_URL
from app.services import ocr, vlm
from app.services.pdf import to_pages

LIGHT_FILTERS = {"sheer", "dimout", "blackout"}

# ตรงกับ PATTERN_TYPES ใน web/src/types/catalog.ts
PATTERN_TYPES = [
    "ลายเรียบ (Plain)",
    "ลายผ้า/เท็กซ์เจอร์ (Texture)",
    "ลายทาง (Stripe)",
    "ลายดอก (Floral)",
    "ลายเรขาคณิต (Geometric)",
    "ลายดามัสก์ (Damask)",
    "ลายใบไม้ (Botanical)",
    "ลายเด็ก (Kids)",
]

SYSTEM = """You extract structured product data from pages of a curtain-fabric catalog (Thai/English).
A page may show several patterns/colorways (swatches) that SHARE one block of specs (collection, composition, width, price...).
Return ONLY JSON. Never invent values: use null when a value is not printed on the page."""

PROMPT = """Image size: {w}x{h} px. OCR lines from this page (text @ [x1,y1,x2,y2] in the same pixel space):
{ocr}

Return JSON:
{{
  "shared": {{  // specs printed once that apply to every swatch on the page
    "collection": str|null, "pattern_name": str|null, "pattern_type": str|null,
    "composition": str|null, "width_cm": number|null, "repeat_cm": number|null,
    "light_filter": "sheer"|"dimout"|"blackout"|null, "base_price": number|null,
    "price_unit": str|null, "care": str|null, "description": str|null
  }},
  "items": [  // one per swatch / product code
    {{ "code": str, "name": str|null, "colors": [str], "bbox": [x1,y1,x2,y2]|null,
       ...any shared field whose value differs for this item }}
  ]
}}
Rules:
- code: copy exactly from the OCR lines (product/article code). One item per distinct code.
- bbox: the swatch/photo region of that item (not its text label), in pixels of this image.
- colors: Thai color words if printed (e.g. "เทา"), else English.
- width_cm: convert to centimeters (e.g. 2.8 m -> 280). base_price: number only, price_unit like "หลา","เมตร".
- light_filter: blackout = ทึบแสง/100%, dimout = กรองแสง/dim-out, sheer = โปร่ง/sheer.
- pattern_type: the visual pattern of the fabric, judged from the swatch image. Exactly one of:
  {pattern_types}. (Light filtering is NOT a pattern type.)
- pattern_name: the design name only, without the word "ลาย" (e.g. "Linen Look").
- If the page has no products (cover, index), return {{"shared": {{}}, "items": []}}."""

SHARED_KEYS = [
    "collection", "pattern_name", "pattern_type", "composition", "width_cm", "repeat_cm",
    "light_filter", "base_price", "price_unit", "care", "description",
]


def _norm(s: str) -> str:
    return re.sub(r"[\s\-_./]", "", s).upper()


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(re.sub(r"[^\d.]", "", str(v)) or "x")
    except ValueError:
        return None


def _crop(page: Image.Image, bbox) -> Image.Image | None:
    if not (isinstance(bbox, list) and len(bbox) == 4):
        return None
    try:
        x1, y1, x2, y2 = (int(float(v)) for v in bbox)
    except (TypeError, ValueError):
        return None
    x1, x2 = sorted((max(0, x1), min(page.width, x2)))
    y1, y2 = sorted((max(0, y1), min(page.height, y2)))
    if x2 - x1 < 24 or y2 - y1 < 24:
        return None
    return page.crop((x1, y1, x2, y2))


def extract_page(page: Image.Image, page_no: int) -> list[dict]:
    """คืนรายการสินค้าของหน้านี้ (ยังไม่บันทึก) พร้อมรูปตัวอย่างลายที่ตัดแล้วใน key "_swatch" """
    lines = ocr.read(page)
    ocr_text = "\n".join(f"{l['text']} @ {l['box']}" for l in lines) or "(no text detected)"
    prompt = PROMPT.format(
        w=page.width, h=page.height, ocr=ocr_text, pattern_types=", ".join(f'"{p}"' for p in PATTERN_TYPES)
    )
    data = vlm.ask_json(prompt, page, SYSTEM)

    shared = data.get("shared") or {}
    all_ocr = _norm(" ".join(l["text"] for l in lines))
    products, seen = [], set()
    for item in data.get("items") or []:
        code = str(item.get("code") or "").strip()
        if not code or _norm(code) in seen:
            continue
        seen.add(_norm(code))
        merged = {k: item.get(k) if item.get(k) not in (None, "") else shared.get(k) for k in SHARED_KEYS}

        review = []
        if _norm(code) not in all_ocr:
            review.append("ไม่พบรหัสนี้ในผล OCR")
        price = _num(merged["base_price"])
        if price is None:
            review.append("ไม่พบราคา")
        light = merged["light_filter"] if merged["light_filter"] in LIGHT_FILTERS else None
        colors = [str(c).strip() for c in (item.get("colors") or []) if str(c).strip()]
        swatch = _crop(page, item.get("bbox"))
        if swatch is None:
            review.append("ตัดรูปลายไม่ได้")

        pattern_name = re.sub(r"^ลาย\s*", "", merged["pattern_name"] or "") or None
        pattern_type = merged["pattern_type"] if merged["pattern_type"] in PATTERN_TYPES else None
        # ตั้งชื่อเอง: ชื่อที่โมเดลตอบมักเป็นแค่ป้ายสี
        name = " ".join(x for x in [pattern_name or merged["collection"], colors[0] if colors else None] if x) or code
        products.append({
            "name": name,
            "base_price": price or 0,
            "price_unit": merged["price_unit"] or "หลา",
            "description": merged["description"],
            "details": {
                "code": code,
                "collection": merged["collection"],
                "pattern_name": pattern_name,
                "pattern_type": pattern_type,
                "colors": colors,
                "composition": merged["composition"],
                "width_cm": _num(merged["width_cm"]),
                "repeat_cm": _num(merged["repeat_cm"]),
                "light_filter": light,
                "tags": [],
                "care": merged["care"],
                "images": [],
            },
            # key ที่ขึ้นต้นด้วย _ ใช้ภายใน ไม่บันทึกลงฐานข้อมูล
            "_swatch": swatch,
            "_review": review,
            "_page": page_no,
        })
    return products


def extract_file(data: bytes, content_type: str = "", on_page=None) -> list[dict]:
    products: list[dict] = []
    for i, page in enumerate(to_pages(data, content_type), start=1):
        found = extract_page(page, i)
        products.extend(found)
        if on_page:
            on_page(i, len(found))
    return products


# ---------- บันทึกลง Supabase ----------

def _sb():
    from supabase import create_client

    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def _upload_swatch(sb, catalog_id: int, img: Image.Image) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=88)
    path = f"products/{catalog_id}/{uuid.uuid4()}.jpg"
    sb.storage.from_(SUPABASE_BUCKET).upload(path, buf.getvalue(), {"content-type": "image/jpeg"})
    return sb.storage.from_(SUPABASE_BUCKET).get_public_url(path)


def ingest(catalog_id: int, file_url: str, on_page=None) -> dict:
    sb = _sb()
    res = httpx.get(file_url, timeout=120, follow_redirects=True)
    res.raise_for_status()
    products = extract_file(res.content, res.headers.get("content-type", ""), on_page)

    # ข้ามรหัสที่มีอยู่แล้วในระบบ
    codes = [p["details"]["code"] for p in products]
    existing = set()
    if codes:
        rows = sb.table("product").select("code:details->>code").in_("details->>code", codes).execute().data
        existing = {r["code"] for r in rows}

    rows, skipped, review = [], [], []
    for p in products:
        swatch = p.pop("_swatch")
        reasons, page_no = p.pop("_review"), p.pop("_page")
        if p["details"]["code"] in existing:
            skipped.append(p["details"]["code"])
            continue
        if reasons:
            review.append({"code": p["details"]["code"], "page": page_no, "reasons": reasons})
        if swatch is not None:
            url = _upload_swatch(sb, catalog_id, swatch)
            p["details"]["images"] = [url]
            p["image_url"] = url
        rows.append({"catalog_id": catalog_id, **p})

    created = sb.table("product").insert(rows).execute().data if rows else []
    # ซ่อนแคตตาล็อกไว้จนกว่าแอดมินจะตรวจ
    sb.table("catalog").update({"is_visible": False}).eq("catalog_id", catalog_id).execute()
    return {
        "created": len(created),
        "skipped_existing": skipped,
        # รายการที่ควรให้แอดมินตรวจ (ดูผ่าน GET /ai/catalog/ingest/{catalog_id})
        "needs_review": review,
    }
