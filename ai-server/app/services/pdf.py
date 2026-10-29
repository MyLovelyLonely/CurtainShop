"""ไฟล์แคตตาล็อก (PDF/รูป) → รูปทีละหน้า ขนาดเป็นทวีคูณ 28px"""
import io

import fitz  # pymupdf
from PIL import Image

from app.config import PAGE_MAX_SIDE

PATCH = 28


def fit_for_vlm(img: Image.Image, max_side: int = PAGE_MAX_SIDE) -> Image.Image:
    """ย่อให้ด้านยาวไม่เกิน max_side และกว้าง/สูงเป็นทวีคูณ 28
    เพื่อให้โมเดลไม่ย่อรูปซ้ำ — พิกัด bbox ที่ตอบกลับจะตรงกับรูปนี้และผล OCR"""
    img = img.convert("RGB")
    scale = min(1.0, max_side / max(img.size))
    w = max(PATCH, round(img.width * scale / PATCH) * PATCH)
    h = max(PATCH, round(img.height * scale / PATCH) * PATCH)
    return img.resize((w, h), Image.LANCZOS)


def to_pages(data: bytes, content_type: str = "") -> list[Image.Image]:
    if content_type == "application/pdf" or data[:4] == b"%PDF":
        doc = fitz.open(stream=data, filetype="pdf")
        pages = []
        for page in doc:
            pix = page.get_pixmap(dpi=150)
            pages.append(fit_for_vlm(Image.open(io.BytesIO(pix.tobytes("png")))))
        return pages
    return [fit_for_vlm(Image.open(io.BytesIO(data)))]
