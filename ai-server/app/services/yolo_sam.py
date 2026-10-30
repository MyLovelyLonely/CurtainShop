"""YOLOv11 (ตรวจจับหน้าต่าง) + SAM2 (ตัดขอบหน้าต่างระดับพิกเซล) ผ่าน ultralytics

โหลดโมเดลครั้งแรกที่ถูกเรียก ถ้าโหลดไม่ได้ (ไม่มี ultralytics / ดาวน์โหลดไม่ได้) จะคืนค่าว่าง
ให้ผู้เรียกใช้กรอบที่ลูกค้าลากเองแทน
"""
import logging
import threading
from pathlib import Path

import numpy as np
from PIL import Image

from app.config import MODELS_DIR, SAM_MODEL, WINDOW_CONF, WINDOW_MODEL

log = logging.getLogger(__name__)

_lock = threading.Lock()
_models: dict[str, object] = {}
_failed: set[str] = set()


def _weights(name: str) -> str:
    # ชื่อไฟล์เฉย ๆ → เก็บ/ดาวน์โหลดไว้ใน ai-server/models
    p = Path(name)
    if p.parent == Path("."):
        MODELS_DIR.mkdir(exist_ok=True)
        return str(MODELS_DIR / p.name)
    return name


def _get(kind: str):
    """kind: "yolo" | "sam" คืนโมเดล หรือ None ถ้าโหลดไม่ได้"""
    with _lock:
        if kind in _models:
            return _models[kind]
        if kind in _failed:
            return None
        try:
            if kind == "sam":
                from ultralytics import SAM

                model = SAM(_weights(SAM_MODEL))
            elif "yoloe" in Path(WINDOW_MODEL).name.lower():
                from ultralytics import YOLOE

                model = YOLOE(_weights(WINDOW_MODEL))
                model.set_classes(["window"], model.get_text_pe(["window"]))
            else:
                from ultralytics import YOLO

                model = YOLO(_weights(WINDOW_MODEL))
        except Exception:  # noqa: BLE001 — ไม่มีโมเดลก็ยังจำลองได้จากกรอบที่ลูกค้าลาก
            log.exception("โหลดโมเดล %s ไม่ได้", kind)
            _failed.add(kind)
            return None
        _models[kind] = model
        return model


def detect_windows(img: Image.Image, limit: int = 5) -> tuple[list[dict], str]:
    """คืน ([{box: [x1,y1,x2,y2] สัดส่วน 0–1, score}], "yolo" | "unavailable") เรียงจากมั่นใจมากไปน้อย"""
    model = _get("yolo")
    if model is None:
        return [], "unavailable"
    w, h = img.size
    with _lock:
        res = model.predict(img, conf=WINDOW_CONF, verbose=False)[0]
    names = res.names
    out = []
    for xyxy, conf, cls in zip(res.boxes.xyxy.tolist(), res.boxes.conf.tolist(), res.boxes.cls.tolist()):
        # โมเดลที่เทรนเองอาจมีหลายคลาส ใช้เฉพาะคลาสที่ชื่อมีคำว่า window
        if "window" not in str(names[int(cls)]).lower():
            continue
        x1, y1, x2, y2 = xyxy
        out.append({"box": [x1 / w, y1 / h, x2 / w, y2 / h], "score": round(conf, 3)})
    out.sort(key=lambda d: d["score"], reverse=True)
    return out[:limit], "yolo"


def segment_window(img: Image.Image, box_px: tuple[float, float, float, float]) -> np.ndarray | None:
    """SAM2 รับกรอบ → mask หน้าต่าง (bool HxW) หรือ None ถ้าใช้ไม่ได้ / ผลดูไม่ใช่หน้าต่าง"""
    model = _get("sam")
    if model is None:
        return None
    try:
        with _lock:
            res = model.predict(img, bboxes=[list(box_px)], verbose=False)[0]
    except Exception:  # noqa: BLE001
        log.exception("SAM2 ทำงานไม่สำเร็จ")
        return None
    if res.masks is None or not len(res.masks.data):
        return None
    mask = res.masks.data[0].cpu().numpy() > 0.5
    if mask.shape != (img.height, img.width):
        mask = np.asarray(Image.fromarray(mask).resize(img.size, Image.NEAREST))
    # mask เล็กเกินไปเทียบกับกรอบ = SAM จับได้แค่บางส่วน (เช่น มู่ลี่เดิม) ไม่ใช้
    x1, y1, x2, y2 = box_px
    if mask.sum() < 0.25 * max(1.0, (x2 - x1) * (y2 - y1)):
        return None
    return mask
