"""จำลองผ้าม่าน"""
import functools
import threading
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field, model_validator

from app.config import SIM_MAX_SIDE
from app.services import curtain_render, diffusion, imageio, yolo_sam

router = APIRouter(prefix="/ai/simulate", tags=["simulate"])


Coord = Annotated[float, Field(ge=0, le=1)]


class Region(BaseModel):
    """จุดที่จะจำลอง: กรอบ 4 มุมเป็นสัดส่วน 0–1 ของรูป เรียง บนซ้าย → บนขวา → ล่างขวา → ล่างซ้าย"""

    quad: list[tuple[Coord, Coord]] = Field(min_length=4, max_length=4)
    # จุดบนแนวพื้นใต้หน้าต่าง: ม่านที่ยาวถึงพื้นจะจบที่ระดับนี้ (ไม่ส่ง = ใช้ขอบล่างของรูป)
    floor: tuple[Coord, Coord] | None = None
    # จุดบนแนวรางเหนือหน้าต่าง: ม่านทุกแบบเริ่มจากระดับนี้ (ไม่ส่ง = เหนือขอบบนหน้าต่าง 10%)
    rail: tuple[Coord, Coord] | None = None

    @model_validator(mode="after")
    def _area(self):
        x, y = np.array([p[0] for p in self.quad]), np.array([p[1] for p in self.quad])
        if abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))) / 2 < 0.001:
            raise ValueError("กรอบหน้าต่างเล็กเกินไป")
        return self


class RenderRequest(BaseModel):
    image_url: str  # รูปห้องของลูกค้า
    swatch_url: str  # รูปลายผ้าของสินค้า (product.details.images)
    style: Literal["pleated", "roller", "louis"]
    regions: list[Region] = Field(min_length=1, max_length=6)
    open_ratio: float = Field(0.35, ge=0, le=1)
    length: Literal["floor", "sill"] = "floor"
    drop: float = Field(0.7, ge=0.05, le=1)
    light_filter: Literal["sheer", "dimout", "blackout"] | None = None
    repeat_cm: float | None = Field(None, gt=0, le=500)
    # ปรับขนาดเอง (1 = ค่าเริ่มต้น)
    width_scale: float = Field(1, ge=0.5, le=2)
    height_scale: float = Field(1, ge=0.5, le=1.5)
    fold_scale: float = Field(1, ge=0.5, le=2)
    pattern_scale: float = Field(1, ge=0.5, le=2)
    refine: bool = True


@router.post("/render")
def render(req: RenderRequest):
    """SAM2 ตัดขอบหน้าต่าง → วาดม่านจากลายผ้าจริง → Stable Diffusion + IP-Adapter เกลาแสงเงา"""
    try:
        room = imageio.load_url(req.image_url, SIM_MAX_SIDE)
        swatch = imageio.load_url(req.swatch_url, 1024)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    # ตัดพื้นขาว/ป้ายชื่อรอบรูปผ้าออก ใช้ทั้งตอนวาดและเป็น image prompt ของ IP-Adapter
    swatch = curtain_render.fabric_region(swatch)

    W, H = room.size
    quads, floors, rails, opts = _scene(req, W, H)
    # SAM2 ตัดขอบหน้าต่างทีละจุด แล้วรวมเป็น mask เดียว
    masks = [m for q in quads if (m := yolo_sam.segment_window(room, curtain_render.quad_bbox(q))) is not None]
    window_mask = np.logical_or.reduce(masks) if masks else None
    draft = curtain_render.render(room, swatch, req.style, quads, opts, window_mask, floors, rails)

    refined, note = (None, "ไม่ได้ขอให้เกลาด้วย AI")
    if req.refine:
        refined, note = diffusion.refine(draft.image, draft.mask, swatch, req.style)

    return {
        "image": imageio.to_b64_jpeg(refined or draft.image),
        "width": W,
        "height": H,
        "refined": refined is not None,
        "mask_source": "sam2" if window_mask is not None else "box",
        "note": note,
    }


def _scene(req: RenderRequest, W: int, H: int):
    """พิกัดสัดส่วน 0–1 → พิกเซลของรูปขนาด W×H + ตัวเลือกการวาด"""
    quads = [[(x * W, y * H) for x, y in r.quad] for r in req.regions]
    floors = [(r.floor[0] * W, r.floor[1] * H) if r.floor else None for r in req.regions]
    rails = [(r.rail[0] * W, r.rail[1] * H) if r.rail else None for r in req.regions]
    opts = curtain_render.Options(
        open_ratio=req.open_ratio,
        length=req.length,
        drop=req.drop,
        light_filter=req.light_filter,
        repeat_cm=req.repeat_cm,
        width_scale=req.width_scale,
        height_scale=req.height_scale,
        fold_scale=req.fold_scale,
        pattern_scale=req.pattern_scale,
    )
    return quads, floors, rails, opts


# ---------- ตัวอย่างสด: ลูกค้าลากกรอบ/เลื่อนแถบปรับค่า → ภาพร่างเล็ก ๆ ภายในเสี้ยววินาที ----------

PREVIEW_SIDE = 800  # พอสำหรับจอมือถือ (วาด 0.1–0.35 วินาที เทียบกับ 0.4–1.3 วินาทีที่ 1600px)
# วาดพร้อมกันได้เท่านี้ ที่เหลือรอคิว — ลูกค้าหลายคนลากพร้อมกันจะได้ไม่แย่ง CPU จนช้าทุกคน
_preview_slots = threading.BoundedSemaphore(4)


# รูปห้อง/ลายผ้าเดิมถูกขอซ้ำทุกครั้งที่ลาก → เก็บที่โหลดแล้วไว้ (URL ใน R2 ไม่เปลี่ยนเนื้อหา)
@functools.lru_cache(maxsize=16)
def _room_small(url: str):
    return imageio.load_url(url, PREVIEW_SIDE)


@functools.lru_cache(maxsize=32)
def _fabric(url: str):
    return curtain_render.fabric_region(imageio.load_url(url, 1024))


@router.post("/preview")
def preview(req: RenderRequest):
    """ภาพร่างสำหรับดูตัวอย่างระหว่างปรับ: รูปเล็ก ไม่ตัดขอบหน้าต่างด้วย SAM2 ไม่เกลาด้วย AI → JPEG"""
    try:
        room, swatch = _room_small(req.image_url), _fabric(req.swatch_url)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    quads, floors, rails, opts = _scene(req, *room.size)
    with _preview_slots:
        draft = curtain_render.render(room, swatch, req.style, quads, opts, None, floors, rails)
    return Response(imageio.to_jpeg(draft.image, 82), media_type="image/jpeg")
