"""BGE-M3 (ข้อความ → เวกเตอร์ความหมาย) + OpenCLIP (รูป/ข้อความ → เวกเตอร์ในปริภูมิเดียวกัน)

ทั้งสองโมเดลให้เวกเตอร์ 1024 มิติ ตรงกับคอลัมน์ vector_embedding.vector_data (normalize แล้ว ใช้ cosine ได้เลย)
โหลดโมเดลครั้งแรกที่ถูกเรียก (ครั้งแรกจะดาวน์โหลดจาก Hugging Face)
"""
import threading

import numpy as np
from PIL import Image

from app.config import CLIP_MODEL, CLIP_PRETRAINED, EMBED_DEVICE, TEXT_EMBED_MODEL

_lock = threading.Lock()
_bge = None
_clip = None  # (model, preprocess, tokenizer)


def _bge_model():
    global _bge
    with _lock:
        if _bge is None:
            from sentence_transformers import SentenceTransformer

            _bge = SentenceTransformer(TEXT_EMBED_MODEL, device=EMBED_DEVICE)
        return _bge


def _clip_model():
    global _clip
    with _lock:
        if _clip is None:
            import open_clip

            model, _, preprocess = open_clip.create_model_and_transforms(
                CLIP_MODEL, pretrained=CLIP_PRETRAINED, device=EMBED_DEVICE
            )
            model.eval()
            _clip = (model, preprocess, open_clip.get_tokenizer(CLIP_MODEL))
        return _clip


def text(texts: list[str]) -> np.ndarray:
    """BGE-M3 dense → (n, 1024)"""
    m = _bge_model()
    return np.asarray(m.encode(texts, normalize_embeddings=True, batch_size=16), np.float32)


def _norm(v) -> np.ndarray:
    v = v.float().cpu().numpy()
    return (v / np.linalg.norm(v, axis=1, keepdims=True)).astype(np.float32)


def clip_images(images: list[Image.Image]) -> np.ndarray:
    """OpenCLIP รูป → (n, 1024)"""
    import torch

    model, preprocess, _ = _clip_model()
    batch = torch.stack([preprocess(im.convert("RGB")) for im in images]).to(EMBED_DEVICE)
    with torch.no_grad():
        return _norm(model.encode_image(batch))


def clip_texts(texts: list[str]) -> np.ndarray:
    """OpenCLIP ข้อความ → (n, 1024) อยู่ในปริภูมิเดียวกับรูป จึงค้นรูปผ้าด้วยคำบรรยายได้"""
    import torch

    model, _, tokenizer = _clip_model()
    with torch.no_grad():
        return _norm(model.encode_text(tokenizer(texts).to(EMBED_DEVICE)))


def to_pg(v: np.ndarray) -> str:
    """เวกเตอร์ → literal ของ pgvector"""
    return "[" + ",".join(f"{x:.6f}" for x in v.tolist()) + "]"
