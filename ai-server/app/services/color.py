"""โทนสีหลักของรูป (palette) + ความใกล้เคียงของสี — ให้ค้นด้วยรูปที่ถ่ายจริงแล้วยังได้ผ้าโทนสีเดียวกัน แม้ลายไม่ตรง"""
import cv2
import numpy as np
from PIL import Image

K = 4
MIN_WEIGHT = 0.06  # สีที่กินพื้นที่น้อยกว่านี้ไม่นับ (เศษพื้นหลัง/เงา)


def _lab(im: Image.Image) -> np.ndarray:
    im = im.copy()
    im.thumbnail((96, 96))
    return cv2.cvtColor(np.asarray(im, np.float32) / 255, cv2.COLOR_RGB2Lab)


def _kmeans(lab: np.ndarray) -> np.ndarray:
    lab = lab.reshape(-1, 3)
    k = min(K, len(lab))
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)
    _, labels, centers = cv2.kmeans(lab, k, None, criteria, 2, cv2.KMEANS_PP_CENTERS)
    weights = np.bincount(labels.ravel(), minlength=k) / len(labels)
    return np.column_stack([centers, weights]).astype(np.float32)


def palette(img: Image.Image, photo: bool = False) -> np.ndarray:
    """→ array (n, 4): [L, a, b, น้ำหนัก] ของสีหลักในปริภูมิ Lab
    photo=True (รูปที่ลูกค้าถ่าย): ใช้ส่วนกลางภาพ และลดน้ำหนักสีที่เหมือนขอบรูป (พื้นหลัง เช่น โต๊ะ ผนัง)
    ถ้าทั้งรูปเป็นผ้า ขอบก็เป็นสีผ้าเหมือนกัน ทุกสีถูกลดเท่ากัน ผลจึงไม่เปลี่ยน"""
    im = img.convert("RGB")
    if photo:
        w, h = im.size
        dx, dy = int(w * 0.15), int(h * 0.15)
        lab = _lab(im)
        bh, bw = max(2, lab.shape[0] // 10), max(2, lab.shape[1] // 10)
        ring = np.concatenate([lab[:bh].reshape(-1, 3), lab[-bh:].reshape(-1, 3), lab[:, :bw].reshape(-1, 3), lab[:, -bw:].reshape(-1, 3)])
        border = _kmeans(ring)
        pal = _kmeans(_lab(im.crop((dx, dy, w - dx, h - dy))))
        bg = (_dist(pal, border).min(1) < 12) & True
        pal[bg, 3] *= 0.25
    else:
        pal = _kmeans(_lab(im))
    pal[:, 3] /= pal[:, 3].sum()
    pal = pal[pal[:, 3] >= MIN_WEIGHT]
    pal[:, 3] /= pal[:, 3].sum()
    return pal


def _dist(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """ระยะห่างของสี (ΔE76) ลดน้ำหนักความสว่างลงครึ่งหนึ่ง เพราะแสงตอนถ่ายแต่ละรูปไม่เท่ากัน"""
    d = a[:, None, :3] - b[None, :, :3]
    d[..., 0] *= 0.5
    return np.sqrt((d**2).sum(-1))


def similarity(q: np.ndarray, p: np.ndarray, scale: float = 18.0) -> float:
    """0–1: สีหลักของรูปค้นหา ↔ สีหลักของผ้า (เฉลี่ยสองทาง ถ่วงตามพื้นที่ของแต่ละสี)"""
    d = _dist(q, p)
    qp = float((d.min(1) * q[:, 3]).sum())
    pq = float((d.min(0) * p[:, 3]).sum())
    return float(np.exp(-(0.6 * qp + 0.4 * pq) / scale))
