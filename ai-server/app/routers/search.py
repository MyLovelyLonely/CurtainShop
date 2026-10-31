"""hybrid search"""
import io

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

from app.services import product_search, search_log

router = APIRouter(prefix="/ai/search", tags=["search"])


class TextRequest(BaseModel):
    q: str = Field(min_length=1, max_length=200)
    limit: int = Field(500, ge=1, le=2000)


@router.post("/text")
def text(req: TextRequest):
    """ค้นด้วยข้อความ: BGE-M3 + BM25 + คำค้นเชิงโครงสร้าง + OpenCLIP → RRF"""
    return product_search.search_text(req.q.strip(), req.limit)


@router.get("/misses")
def misses(limit: int = 50):
    """คำค้นที่ไม่เจอสินค้า / ตีความเป็นเงื่อนไขไม่ได้ / ต้องเดาจากความหมาย เรียงตามจำนวนครั้ง
    ใช้ดูว่าควรเพิ่มคำไหนในรายการคำ (bm25_rrf)"""
    return search_log.misses(max(1, min(limit, 500)))


@router.post("/image")
def image(file: UploadFile = File(...), limit: int = Form(200)):
    """ค้นด้วยรูปอ้างอิง: OpenCLIP รูป → ลายผ้าที่คล้ายที่สุด"""
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(file.file.read()))).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, "ไฟล์ไม่ใช่รูปภาพที่รองรับ") from e
    img.thumbnail((1024, 1024))
    return product_search.search_image(img, max(1, min(limit, 2000)))
