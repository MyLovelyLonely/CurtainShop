"""PaddleOCR: อ่านข้อความ + ตำแหน่ง (รันบน CPU)"""
import os
from functools import lru_cache

import numpy as np
from PIL import Image

from app.config import OCR_LANG

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")


@lru_cache(maxsize=1)
def _engine():
    from paddleocr import PaddleOCR

    return PaddleOCR(
        lang=OCR_LANG,
        text_detection_model_name=os.getenv("OCR_DET_MODEL", "PP-OCRv5_mobile_det"),
        # ต้องระบุคู่กัน ไม่งั้นระบุแค่ det แล้วจะได้ rec รุ่นทั่วไปที่ไม่ใช่ภาษาไทย
        text_recognition_model_name=os.getenv("OCR_REC_MODEL", f"{OCR_LANG}_PP-OCRv5_mobile_rec"),
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        # Paddle 3.x บน Windows CPU: oneDNN พัง (ConvertPirAttribute2RuntimeAttribute)
        enable_mkldnn=False,
    )


def read(img: Image.Image) -> list[dict]:
    """คืน [{text, box: [x1, y1, x2, y2], score}] ในพิกัดของรูปที่ส่งเข้ามา"""
    r = _engine().predict(np.array(img.convert("RGB")))[0]
    return [
        {"text": t, "box": [int(v) for v in b], "score": round(float(s), 3)}
        for t, s, b in zip(r["rec_texts"], r["rec_scores"], r["rec_boxes"])
        if t.strip()
    ]
