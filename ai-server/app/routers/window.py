"""ตรวจหน้าต่าง + ประเมินขนาด"""
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import SIM_MAX_SIDE
from app.services import imageio, yolo_sam

router = APIRouter(prefix="/ai/window", tags=["window"])


class DetectRequest(BaseModel):
    image_url: str


@router.post("/detect")
def detect(req: DetectRequest):
    """YOLOv11 หากรอบหน้าต่างเบื้องต้น ให้ลูกค้าลากปรับก่อนจำลอง (กรอบเป็นสัดส่วน 0–1 ของรูป)"""
    try:
        img = imageio.load_url(req.image_url, SIM_MAX_SIDE)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return _detect(img)


@router.post("/detect-file")
def detect_file(file: UploadFile = File(...)):
    """เหมือน /detect แต่รับไฟล์รูปตรง ๆ — เว็บส่งมาพร้อมกับอัปโหลดขึ้น R2 ไม่ต้องรออัปเสร็จแล้วดาวน์โหลดกลับ
    ขนาดรูปที่คืนตรงกับตอนจำลอง (/ai/simulate/render โหลดไฟล์เดียวกันจาก R2 แล้วย่อด้วย SIM_MAX_SIDE เท่ากัน)"""
    try:
        img = imageio.from_bytes(file.file.read(), SIM_MAX_SIDE)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return _detect(img)


def _detect(img):
    windows, detector = yolo_sam.detect_windows(img)
    return {"width": img.width, "height": img.height, "windows": windows, "detector": detector}
