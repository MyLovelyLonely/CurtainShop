"""hybrid search"""
import io
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

from app.services import product_search

router = APIRouter(prefix="/ai/search", tags=["search"])


class TextRequest(BaseModel):
    q: str = Field(min_length=1, max_length=200)
    limit: int = Field(30, ge=1, le=100)
    # ชั่วคราวช่วงทดสอบ: สินค้าที่ไม่อยู่ใน DB (web/src/services/test-products.ts)
    extra: list[dict] = []


@router.post("/text")
def text(req: TextRequest):
    """ค้นด้วยข้อความ: BGE-M3 + BM25 + คำค้นเชิงโครงสร้าง + OpenCLIP → RRF"""
    return product_search.search_text(req.q.strip(), req.extra, req.limit)


@router.post("/image")
def image(file: UploadFile = File(...), limit: int = Form(30), extra: str = Form("[]")):
    """ค้นด้วยรูปอ้างอิง: OpenCLIP รูป → ลายผ้าที่คล้ายที่สุด"""
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(file.file.read()))).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, "ไฟล์ไม่ใช่รูปภาพที่รองรับ") from e
    img.thumbnail((1024, 1024))
    return product_search.search_image(img, json.loads(extra or "[]"), max(1, min(limit, 100)))
