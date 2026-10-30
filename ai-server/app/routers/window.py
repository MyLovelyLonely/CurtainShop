"""ตรวจหน้าต่าง + ประเมินขนาด"""
from fastapi import APIRouter, HTTPException
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
    windows, detector = yolo_sam.detect_windows(img)
    return {"width": img.width, "height": img.height, "windows": windows, "detector": detector}
