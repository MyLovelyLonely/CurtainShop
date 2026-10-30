"""จำลองผ้าม่าน"""
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, HTTPException
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
    quads = [[(x * W, y * H) for x, y in r.quad] for r in req.regions]
    floors = [(r.floor[0] * W, r.floor[1] * H) if r.floor else None for r in req.regions]
    rails = [(r.rail[0] * W, r.rail[1] * H) if r.rail else None for r in req.regions]
    # SAM2 ตัดขอบหน้าต่างทีละจุด แล้วรวมเป็น mask เดียว
    masks = [m for q in quads if (m := yolo_sam.segment_window(room, curtain_render.quad_bbox(q))) is not None]
    window_mask = np.logical_or.reduce(masks) if masks else None

    opts = curtain_render.Options(
        open_ratio=req.open_ratio,
        length=req.length,
        drop=req.drop,
        light_filter=req.light_filter,
        repeat_cm=req.repeat_cm,
    )
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
