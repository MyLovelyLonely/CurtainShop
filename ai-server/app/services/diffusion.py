"""Stable Diffusion inpainting + IP-Adapter: เกลาแสงเงาของม่านที่วาดจากลายผ้าจริงให้กลืนกับห้อง

- ภาพร่างจาก curtain_render เป็นจุดเริ่ม (strength ต่ำ) → ลายผ้าและรูปทรงคงเดิม
- IP-Adapter ใช้รูปลายผ้าจากแคตตาล็อกเป็นคำสั่ง (image prompt) จึงไม่ต้องเทรนโมเดลใหม่เมื่อเพิ่มลายผ้า
- แก้เฉพาะบริเวณผ้าม่าน ส่วนอื่นของห้องคงเดิมทุกพิกเซล
"""
import logging
import threading

import cv2
import numpy as np
from PIL import Image

from app.config import (
    IP_ADAPTER_REPO,
    IP_ADAPTER_SCALE,
    IP_ADAPTER_WEIGHT,
    SD_INPAINT_MODEL,
    SD_SIZE,
    SD_STEPS,
    SD_STRENGTH,
    SIM_REFINE,
)

log = logging.getLogger(__name__)

PROMPTS = {
    "pleated": "photo of elegant pinch pleated curtains hanging from a curtain rod, soft natural vertical folds",
    "roller": "photo of a fabric roller blind mounted in a window frame, smooth flat fabric, aluminium bottom bar",
    "louis": "photo of luxurious swag and tail valance curtains with tassel fringe trim, tied-back drapes, classic",
}
SUFFIX = ", realistic fabric texture, interior photography, natural soft lighting, high detail"
NEGATIVE = "cartoon, painting, illustration, blurry, deformed, distorted, text, watermark, people, extra window, lowres"

_lock = threading.Lock()
_pipe = None
_load_error: str | None = None


def _load():
    global _pipe, _load_error
    if _pipe is not None or _load_error is not None:
        return _pipe
    try:
        import torch
        from diffusers import StableDiffusionInpaintPipeline

        if not torch.cuda.is_available():
            raise RuntimeError("ไม่พบ GPU (CUDA)")
        kw = dict(torch_dtype=torch.float16, safety_checker=None, requires_safety_checker=False)
        try:
            pipe = StableDiffusionInpaintPipeline.from_pretrained(SD_INPAINT_MODEL, variant="fp16", **kw)
        except (OSError, ValueError):  # repo ไม่มีไฟล์ fp16 แยก
            pipe = StableDiffusionInpaintPipeline.from_pretrained(SD_INPAINT_MODEL, **kw)
        pipe.load_ip_adapter(IP_ADAPTER_REPO, subfolder="models", weight_name=IP_ADAPTER_WEIGHT)
        pipe.set_ip_adapter_scale(IP_ADAPTER_SCALE)
        pipe.to("cuda")
        pipe.set_progress_bar_config(disable=True)
        _pipe = pipe
    except Exception as e:  # noqa: BLE001 — ไม่มี GPU/โมเดล ก็ยังส่งภาพร่างได้
        log.exception("โหลด Stable Diffusion ไม่ได้")
        _load_error = str(e)
    return _pipe


def _crop_box(mask: np.ndarray, pad: float = 0.15) -> tuple[int, int, int, int] | None:
    ys, xs = np.nonzero(mask > 0.02)
    if not len(xs):
        return None
    x1, y1, x2, y2 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    p = int(max(x2 - x1, y2 - y1) * pad)
    H, W = mask.shape
    return max(0, x1 - p), max(0, y1 - p), min(W, x2 + p), min(H, y2 + p)


def refine(image: Image.Image, mask: np.ndarray, swatch: Image.Image, style: str) -> tuple[Image.Image | None, str]:
    """คืน (ภาพที่เกลาแล้ว หรือ None, หมายเหตุ) — None = ใช้ภาพร่างแทน"""
    if not SIM_REFINE:
        return None, "ปิดการเกลาด้วย AI (SIM_REFINE=false)"
    with _lock:
        pipe = _load()
        if pipe is None:
            return None, f"ใช้ Stable Diffusion ไม่ได้: {_load_error}"

        box = _crop_box(mask)
        if box is None:
            return None, "ไม่มีบริเวณผ้าม่าน"
        x1, y1, x2, y2 = box
        crop = image.crop(box)
        cw, ch = crop.size
        scale = SD_SIZE / max(cw, ch)
        w, h = max(64, int(cw * scale) // 8 * 8), max(64, int(ch * scale) // 8 * 8)

        m = (mask[y1:y2, x1:x2] > 0.02).astype(np.uint8)
        m = cv2.dilate(m, np.ones((7, 7), np.uint8))
        m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3)
        mask_img = Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).resize((w, h))

        import torch

        try:
            out = pipe(
                prompt=PROMPTS[style] + SUFFIX,
                negative_prompt=NEGATIVE,
                image=crop.resize((w, h), Image.LANCZOS),
                mask_image=mask_img,
                ip_adapter_image=swatch,
                strength=SD_STRENGTH,
                num_inference_steps=SD_STEPS,
                guidance_scale=6.0,
                width=w,
                height=h,
                generator=torch.Generator("cuda").manual_seed(7),
            ).images[0]
        except Exception as e:  # noqa: BLE001 — เช่น หน่วยความจำ GPU ไม่พอ
            log.exception("Stable Diffusion ทำงานไม่สำเร็จ")
            torch.cuda.empty_cache()
            return None, f"Stable Diffusion ทำงานไม่สำเร็จ: {e}"

    # วางกลับเฉพาะบริเวณผ้าม่าน (ขอบนุ่ม) ส่วนอื่นของห้องคงเดิม
    out = np.asarray(out.resize((cw, ch), Image.LANCZOS), np.float32)
    base = np.asarray(image, np.float32).copy()

    # แยกความถี่: แสงเงา/รอยพับภาพรวมเอาจาก SD แต่รายละเอียดลายผ้าเอาจากภาพร่าง
    # (SD มักเบลอลายละเอียดสีอ่อน ทำให้ลายไม่ตรงกับผ้าจริง)
    sigma = max(2.0, 0.008 * max(cw, ch))
    draft = base[y1:y2, x1:x2]
    out = cv2.GaussianBlur(out, (0, 0), sigma) + (draft - cv2.GaussianBlur(draft, (0, 0), sigma))

    fm = cv2.GaussianBlur(mask[y1:y2, x1:x2], (0, 0), 1.5)[..., None]
    base[y1:y2, x1:x2] = base[y1:y2, x1:x2] * (1 - fm) + out * fm
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)), "เกลาแสงเงาด้วย Stable Diffusion + IP-Adapter"
