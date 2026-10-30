"""โหลดรูปจาก URL ของร้าน (R2 / Supabase Storage) และแปลงผลลัพธ์เป็น base64"""
import base64
import io

import httpx
from PIL import Image, ImageOps

from app.config import ALLOWED_IMAGE_PREFIXES

MAX_BYTES = 20 * 1024 * 1024


def load_url(url: str, max_side: int) -> Image.Image:
    """ValueError ถ้า URL ไม่ใช่ไฟล์ของร้าน หรือไม่ใช่รูป"""
    if not any(url.startswith(p) for p in ALLOWED_IMAGE_PREFIXES):
        raise ValueError("URL รูปต้องเป็นไฟล์ใน storage ของร้าน")
    res = httpx.get(url, timeout=30)
    if res.status_code != 200:
        raise ValueError(f"โหลดรูปไม่ได้ ({res.status_code})")
    if len(res.content) > MAX_BYTES:
        raise ValueError("รูปใหญ่เกิน 20MB")
    try:
        img = Image.open(io.BytesIO(res.content))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception as e:  # noqa: BLE001 — PIL โยนได้หลายแบบ
        raise ValueError("ไฟล์ไม่ใช่รูปภาพที่รองรับ") from e
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    return img


def to_b64_jpeg(img: Image.Image, quality: int = 90) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()
