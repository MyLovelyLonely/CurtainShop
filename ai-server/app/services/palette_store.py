"""โทนสีหลักของรูปผ้าแต่ละรูป (ใช้ค้นด้วยรูป) เก็บเป็นไฟล์ใน ai-server/models

ไม่เก็บใน vector_embedding เพราะตารางนั้นรับเฉพาะ embedding_type = text / image (check constraint ตาม data dictionary)
คำนวณตอนสร้างเวกเตอร์ + ทยอยคำนวณที่ขาดในเบื้องหลัง (warm) — key เป็น URL รูป (เปลี่ยนรูป = URL ใหม่ = คำนวณใหม่)
"""
import json
import logging
import threading

import numpy as np

from app.config import MODELS_DIR
from app.services import color, imageio
from app.services.curtain_render import fabric_region

log = logging.getLogger(__name__)

FILE = MODELS_DIR / "palette_cache.json"

_lock = threading.Lock()
_data: dict[str, list] | None = None
_dirty = 0
_warming = threading.Lock()


def _load() -> dict[str, list]:
    global _data
    if _data is None:
        try:
            _data = json.loads(FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _data = {}
    return _data


def flush():
    global _dirty
    with _lock:
        if not _dirty:
            return
        MODELS_DIR.mkdir(exist_ok=True)
        tmp = FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(_load()), encoding="utf-8")
        tmp.replace(FILE)
        _dirty = 0


def get(url: str | None) -> np.ndarray | None:
    if not url:
        return None
    with _lock:
        v = _load().get(url)
    return np.asarray(v, np.float32) if v else None


def put(url: str, pal: np.ndarray):
    global _dirty
    with _lock:
        _load()[url] = pal.round(3).tolist()
        _dirty += 1
    if _dirty >= 50:
        flush()


def compute(url: str) -> np.ndarray | None:
    try:
        pal = color.palette(fabric_region(imageio.load_url(url, 512)))
    except ValueError as e:  # รูปไม่ได้อยู่ใน storage ของร้าน / โหลดไม่ได้
        log.warning("คำนวณโทนสีไม่ได้ %s: %s", url, e)
        return None
    put(url, pal)
    return pal


def warm(urls: list[str]):
    """คำนวณโทนสีของรูปที่ยังไม่มี (เรียกในเธรดเบื้องหลัง ทำทีละงานเดียว)"""
    if not _warming.acquire(blocking=False):
        return
    try:
        missing = [u for u in dict.fromkeys(urls) if u and get(u) is None]
        if missing:
            log.info("คำนวณโทนสีผ้า %d รูป", len(missing))
        for u in missing:
            compute(u)
        flush()
    finally:
        _warming.release()


def warm_in_background(urls: list[str]):
    threading.Thread(target=warm, args=(urls,), daemon=True).start()
