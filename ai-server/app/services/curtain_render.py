"""วาดผ้าม่านจากรูปลายผ้าจริงลงบนรูปห้อง: ผ้าจีบ (pleated) / ม่านม้วน (roller) / ม่านหลุยส์ (louis)

ขั้นนี้ไม่ใช้ AI — นำรูปลายผ้าของสินค้าในฐานข้อมูลมาปูเป็นพื้นผิวตามรูปทรงของม่านแต่ละแบบแล้วลงเงาจีบ/ลอน
ลายและสีจึงตรงกับผ้าจริง จากนั้น diffusion (services/diffusion.py) จะเกลาแสงเงาให้กลืนกับห้องอีกที

รูปหนึ่งมีได้หลายจุด แต่ละจุดเป็นกรอบ 4 มุม (หน้าต่างที่ถ่ายเอียง เช่น มุมห้อง/หน้าต่างแบบ bay)
ม่านวาดบน "กรอบตรง" ก่อน แล้วบิดมุมมอง (perspective) ให้ตรงกับกรอบ 4 มุมนั้น
"""
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

STYLES = ("pleated", "roller", "louis")

# ความทึบของผ้าตามค่าการกรองแสงในฐานข้อมูล (product.details.light_filter)
OPACITY = {"sheer": 0.6, "dimout": 0.93, "blackout": 1.0}
# แสงจากหน้าต่างที่ทะลุผ้าออกมา (ทำให้ผ้าส่วนที่บังกระจกสว่างขึ้น)
TRANSMIT = {"sheer": 0.45, "dimout": 0.15, "blackout": 0.0}

DEFAULT_WINDOW_CM = 160  # ไม่รู้ขนาดจริง → สมมติหน้าต่างกว้างเท่านี้ เพื่อกำหนดขนาดลายผ้า
DEFAULT_REPEAT_CM = 32  # รูปลายผ้าในแคตตาล็อกส่วนใหญ่ครอบคลุมผ้าประมาณนี้
MAX_FRAME_SIDE = 2400  # กันกรอบตรงใหญ่เกินจนใช้หน่วยความจำมาก

Quad = list[tuple[float, float]]  # มุม บนซ้าย → บนขวา → ล่างขวา → ล่างซ้าย (พิกเซลของรูป)


@dataclass
class Options:
    open_ratio: float = 0.35  # ผ้าจีบ/หลุยส์: 0 = ปิดสนิท, 1 = รูดเปิดสุด
    length: str = "floor"  # ผ้าจีบ/หลุยส์: floor = ยาวถึงพื้น, sill = ถึงใต้ขอบหน้าต่าง
    drop: float = 0.7  # ม่านม้วน: สัดส่วนความสูงหน้าต่างที่ม่านลงมาบัง
    light_filter: str | None = None
    repeat_cm: float | None = None
    window_width_cm: float | None = None


@dataclass
class Frame:
    """พื้นที่วาดแบบตรง (ไม่เอียง) ของจุดหนึ่ง"""

    shape: tuple[int, int]
    box: tuple[float, float, float, float]  # หน้าต่างในกรอบตรง
    floor: float  # y ของพื้นในกรอบตรง
    rail: float  # y ของราง/ขอบบนของม่านในกรอบตรง


@dataclass
class Rendered:
    image: Image.Image  # รูปห้องที่มีม่านแล้ว
    mask: np.ndarray  # float32 0–1 บริเวณผ้าม่านทุกจุด (ใช้เป็น mask ให้ diffusion)


# ---------- พื้นผิวผ้า ----------


def _longest_run(keep: np.ndarray) -> tuple[int, int]:
    best, start, run = (0, 0), None, 0
    for i, k in enumerate(np.append(keep, False)):
        if k and start is None:
            start = i
        elif not k and start is not None:
            if i - start > run:
                best, run = (start, i), i - start
            start = None
    return best


def fabric_region(img: Image.Image) -> Image.Image:
    """ตัดเฉพาะส่วนที่เป็นเนื้อผ้า: รูปผ้าจากเว็บ/แคตตาล็อกมักมีพื้นขาวรอบ ขอบหยัก หรือป้ายชื่อ
    (ถ้าเนื้อผ้าเต็มกรอบอยู่แล้ว เช่น ผ้าเรียบ คืนรูปเดิม)"""
    a = np.asarray(img.convert("L"), np.float32)
    h, w = a.shape
    k = max(3, min(h, w) // 60)
    mean = cv2.blur(a, (k, k))
    std = np.sqrt(np.maximum(cv2.blur(a * a, (k, k)) - mean * mean, 0))
    busy = std > 8  # บริเวณที่มีลาย/เท็กซ์เจอร์

    b = max(2, min(h, w) // 30)
    border = np.concatenate([busy[:b].ravel(), busy[-b:].ravel(), busy[:, :b].ravel(), busy[:, -b:].ravel()])
    if border.mean() > 0.2 or busy.mean() < 2 * border.mean() + 0.1:
        return img  # ขอบรูปก็เป็นผ้า = ผ้าเต็มกรอบ

    rows = busy.mean(1)
    r0, r1 = _longest_run(rows > 0.6 * rows.max())
    cols = busy[r0:r1].mean(0)
    c0, c1 = _longest_run(cols > 0.6 * cols.max())
    if (r1 - r0) * (c1 - c0) < 0.25 * h * w:
        return img
    # ตัดขอบหยักทิ้งอีกนิด
    dy, dx = int((r1 - r0) * 0.05), int((c1 - c0) * 0.05)
    return img.crop((c0 + dx, r0 + dy, c1 - dx, r1 - dy))


def _texture(swatch: Image.Image, tile_px: int) -> np.ndarray:
    """ตัดรูปลายผ้าเป็นจัตุรัส ปรับแสงให้เรียบ แล้วเกลี่ยขอบให้ปูต่อกันได้ไม่เห็นรอยต่อ"""
    w, h = swatch.size
    s = int(min(w, h) * 0.88)  # ตัดขอบรูปที่มักมีเงา/ป้ายรหัส
    left, top = (w - s) // 2, (h - s) // 2
    t = swatch.crop((left, top, left + s, top + s)).resize((tile_px, tile_px), Image.LANCZOS)
    t = np.asarray(t, np.float32) / 255

    # รูปถ่ายผ้ามักสว่างไม่เท่ากันทั้งรูป → หารด้วยแสงความถี่ต่ำ
    low = cv2.GaussianBlur(t, (0, 0), tile_px / 3)
    t = np.clip(t / (low + 1e-3) * low.mean((0, 1)), 0, 1)

    # เลื่อนครึ่งรูปแล้วผสมตรงขอบ: ขอบของ tile กลายเป็นเนื้อกลางรูปที่ต่อเนื่องกัน
    shifted = np.roll(t, (tile_px // 2, tile_px // 2), (0, 1))
    r = np.abs(np.linspace(-1, 1, tile_px, dtype=np.float32))
    edge = np.maximum(r[:, None], r[None, :])
    wgt = np.clip((1 - edge) / 0.6, 0, 1)[..., None]
    return np.ascontiguousarray(t * wgt + shifted * (1 - wgt))


def _sample(tex: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    th, tw = tex.shape[:2]
    return cv2.remap(
        tex,
        np.mod(u, tw).astype(np.float32),
        np.mod(v, th).astype(np.float32),
        cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_WRAP,
    )


def _light_factor(room: np.ndarray, box) -> float:
    """ความสว่างของผนังรอบหน้าต่าง → ปรับผ้าให้มืด/สว่างตามห้อง"""
    H, W = room.shape[:2]
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    ox1, oy1 = int(max(0, x1 - 0.4 * bw)), int(max(0, y1 - 0.3 * bh))
    ox2, oy2 = int(min(W, x2 + 0.4 * bw)), int(min(H, y2 + 0.3 * bh))
    ring = np.ones((oy2 - oy1, ox2 - ox1), bool)
    ring[max(0, int(y1) - oy1) : max(0, int(y2) - oy1), max(0, int(x1) - ox1) : max(0, int(x2) - ox1)] = False
    area = room[oy1:oy2, ox1:ox2][ring]
    luma = float((area @ np.array([0.299, 0.587, 0.114], np.float32)).mean()) if area.size else 0.6
    return float(np.clip(0.55 + 0.6 * luma, 0.72, 1.06))


def _cylinder(t: np.ndarray) -> np.ndarray:
    """เงาของทรงกระบอก (ราง/ท่อม้วน/ราวล่าง/เชือกรวบ) t = 0–1 ตามแนวตั้ง"""
    return 0.45 + 0.55 * np.clip(np.sin(np.pi * np.clip(t, 0, 1)), 0, 1) ** 0.6


def _smooth(t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def _folds(theta: np.ndarray, side: float = 1.0) -> np.ndarray:
    """เงาของรอยพับ: สันที่หันเข้าหากล้องสว่าง ร่องมืด"""
    return 0.6 + 0.4 * ((1 + np.cos(theta)) / 2) ** 0.7 + 0.05 * np.sin(theta) * side


# ---------- ม่านแต่ละแบบ (วาดในกรอบตรง): คืน (สีผ้า HxWx3, mask HxW bool, ส่วนทึบเสมอ HxW bool) ----------


def _pleated(f: Frame, tex, o: Options):
    H, W = f.shape
    x1, y1, x2, y2 = f.box
    bw, bh = x2 - x1, y2 - y1
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    rod_y = f.rail
    bottom = f.floor if o.length == "floor" else min(f.floor, y2 + 0.08 * bh)
    left, right = max(0.0, x1 - 0.14 * bw), min(W - 1.0, x2 + 0.14 * bw)
    span = right - left
    half = span / 2
    panel = half + (span * 0.14 - half) * float(np.clip(o.open_ratio, 0, 1))
    # ผ้ากว้าง 2.2 เท่าของช่วงที่ปิด (จีบ) จำนวนจีบคงที่ รูดเปิดแล้วจีบจะถี่ขึ้น
    fabric = half * 2.2
    folds = max(6, round(half / max(bw * 0.045, 8)))
    period = panel / folds
    k = fabric / panel

    rgb = np.zeros((H, W, 3), np.float32)
    mask = np.zeros((H, W), bool)
    for x0, direction in ((left, 1.0), (right, -1.0)):
        s = (xx - x0) * direction  # ระยะจากขอบนอกของผืนเข้าหากลางหน้าต่าง
        theta = 2 * np.pi * s / period
        hem = bottom - 0.012 * bh * (1 + np.cos(theta)) / 2
        inside = (s >= 0) & (s <= panel) & (yy >= rod_y) & (yy <= hem)

        # หน้าจีบที่หันเข้าหากล้องเห็นลายเต็ม ด้านข้างจีบลายถูกบีบ (ค่าเฉลี่ยการบีบ = k)
        u = k * s + (1 - k) * period / (2 * np.pi) * np.sin(theta)
        shade = _folds(theta, direction)
        shade *= 0.85 + 0.15 * np.clip((yy - rod_y) / (0.05 * bh), 0, 1)  # หัวจีบตรงราง
        shade *= 1 - 0.18 * np.clip(1 - (panel - s) / (0.4 * period), 0, 1)  # เงาที่ขอบในของผืน
        col = _sample(tex, u * direction, yy - rod_y) * shade[..., None]
        rgb[inside] = col[inside]
        mask |= inside

    # รางม่าน
    rh = max(3.0, 0.014 * bh)
    rail = (xx >= left - 0.03 * span) & (xx <= right + 0.03 * span) & (np.abs(yy - rod_y) <= rh)
    rail_shade = _cylinder((yy - rod_y + rh) / (2 * rh))
    rgb[rail] = (np.array([0.28, 0.24, 0.21], np.float32) * rail_shade[..., None])[rail] * 1.6
    return rgb, mask | rail, rail


def _roller(f: Frame, tex, o: Options):
    H, W = f.shape
    x1, y1, x2, y2 = f.box
    bw, bh = x2 - x1, y2 - y1
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    X0, X1 = max(0.0, x1 - 0.02 * bw), min(W - 1.0, x2 + 0.02 * bw)
    tube = max(6.0, 0.05 * bh)
    top = f.rail
    drop_y = top + tube + float(np.clip(o.drop, 0.05, 1)) * (y2 + 0.02 * bh - top - tube)
    bar = max(3.0, 0.02 * bh)
    cols = (xx >= X0) & (xx <= X1)

    # ผ้าเรียบ ลายยึดกับราวล่าง (ม้วนขึ้นลง ลายเลื่อนตามผ้า)
    cloth = cols & (yy >= top + tube) & (yy <= drop_y)
    shade = 0.9 + 0.08 * np.clip((yy - top) / max(1.0, drop_y - top), 0, 1)
    shade *= 1 - 0.12 * np.clip(1 - np.minimum(xx - X0, X1 - xx) / 3, 0, 1)
    rgb = _sample(tex, xx - X0, yy - drop_y) * shade[..., None]
    mean = rgb[cloth].mean(0) if cloth.any() else np.full(3, 0.7, np.float32)

    # ท่อม้วน: ผ้าที่ม้วนอยู่ ลายถูกบีบตามแนวตั้ง
    roll = (xx >= X0 - 0.01 * bw) & (xx <= X1 + 0.01 * bw) & (yy >= top) & (yy < top + tube)
    roll_rgb = _sample(tex, xx - X0, (yy - top) * 0.3) * _cylinder((yy - top) / tube)[..., None]
    rgb[roll] = roll_rgb[roll]

    # ราวล่าง
    rail = cols & (yy > drop_y) & (yy <= drop_y + bar)
    rail_rgb = (0.5 * mean + 0.5 * np.array([0.72, 0.72, 0.72], np.float32)) * _cylinder((yy - drop_y) / bar)[..., None]
    rgb[rail] = rail_rgb[rail]
    return rgb, cloth | roll | rail, roll | rail


def _tassels(along: np.ndarray, dist: np.ndarray, fr: float, pitch: float, trim) -> tuple[np.ndarray, np.ndarray]:
    """พู่ห้อยตามขอบผ้า: along = ระยะตามแนวขอบ, dist = ระยะที่ห่างจากขอบออกไป → (mask, สี)"""
    phase = np.mod(along / pitch, 1.0)
    length = fr * (0.45 + 0.55 * np.sin(np.pi * phase) ** 0.5)  # หัวพู่ยาว ระหว่างพู่สั้น
    m = (dist > 0) & (dist <= length)
    strands = 0.7 + 0.3 * np.cos(2 * np.pi * along / max(1.5, pitch / 4)) ** 2
    head = 1 - 0.25 * np.clip(1 - dist / max(1.0, 0.3 * fr), 0, 1)  # โคนพู่ (ติดผ้า) มืดกว่า
    return m, trim * (strands * head)[..., None]


def _louis(f: Frame, tex, o: Options):
    """ม่านหลุยส์: ระบายโค้ง (swag) ด้านบน + หางห้อย (jabot) สองข้าง + ม่านสองผืนรวบเชือกกลางผืน + พู่ตามขอบ"""
    H, W = f.shape
    x1, y1, x2, y2 = f.box
    bw, bh = x2 - x1, y2 - y1
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    top = f.rail
    bottom = f.floor if o.length == "floor" else min(f.floor, y2 + 0.08 * bh)
    left, right = max(0.0, x1 - 0.14 * bw), min(W - 1.0, x2 + 0.14 * bw)
    span = right - left
    fr = max(4.0, 0.035 * bh)  # ความยาวพู่
    pitch = max(4.0, 0.022 * span)  # ระยะห่างระหว่างพู่
    trim = np.clip(tex.mean((0, 1)) * 0.62, 0, 1)  # สีพู่/เชือก: โทนเดียวกับผ้าแต่เข้มกว่า

    rgb = np.zeros((H, W, 3), np.float32)
    mask = np.zeros((H, W), bool)
    solid = np.zeros((H, W), bool)

    def put(m, col):
        rgb[m] = col[m]
        mask[m] = True

    # 1) ม่านสองผืน: บนกว้าง → รวบเชือกช่วงกลาง → บานออกถึงพื้น
    open_ = float(np.clip(o.open_ratio, 0, 1))
    top_w = span * (0.5 - 0.3 * open_)
    tie_w, bot_w = span * 0.11, span * 0.2
    tie_y = top + 0.55 * (bottom - top)
    fabric = span * 0.9  # ความกว้างผ้าต่อผืน (คงที่ ผืนแคบลง = จีบแน่นขึ้น)
    folds = 7
    for x0, d in ((left, 1.0), (right, -1.0)):
        s = (xx - x0) * d
        width = np.where(
            yy < tie_y,
            top_w + (tie_w - top_w) * _smooth((yy - top) / (tie_y - top)),
            tie_w + (bot_w - tie_w) * _smooth((yy - tie_y) / max(1.0, bottom - tie_y)),
        )
        sn = s / width
        theta = 2 * np.pi * sn * folds
        inside = (sn >= 0) & (sn <= 1) & (yy >= top) & (yy <= bottom)
        shade = _folds(theta, d) * (1 - 0.18 * np.exp(-(((yy - tie_y) / (0.05 * bh)) ** 2)))  # ผ้าย่นตรงที่รวบ
        put(inside, _sample(tex, sn * fabric * d, yy - top) * shade[..., None])

        # พู่ตามขอบในของผืน
        m, col = _tassels(yy - top, s - width, fr * 0.8, pitch, trim)
        m &= (yy >= top) & (yy <= bottom)
        put(m, col)
        solid |= m

        # เชือกรวบ
        rh = max(2.0, 0.012 * bh)
        rope = (np.abs(yy - tie_y) <= rh) & (s >= -0.01 * bw) & (s <= tie_w + 0.01 * bw)
        put(rope, trim * 1.3 * _cylinder((yy - tie_y + rh) / (2 * rh))[..., None])
        solid |= rope

    # 2) ระบายโค้งด้านบน
    jab_w = 0.11 * span
    sx0, sx1 = left + jab_w * 0.6, right - jab_w * 0.6
    n = int(np.clip(round((sx1 - sx0) / (0.3 * bh)), 2, 5))
    head = max(4.0, 0.03 * bh)
    base = top + head + 0.06 * bh
    depth = 0.3 * bh
    fx = np.mod((xx - sx0) / (sx1 - sx0) * n, 1.0)
    sag = np.clip(np.sin(np.pi * fx), 0, 1)
    hem = base + depth * sag
    in_swag = (xx >= sx0) & (xx <= sx1) & (yy >= top) & (yy <= hem)
    r = np.clip((yy - top) / np.maximum(hem - top, 1.0), 0, 1)  # รอยพับโค้งตามขอบล่าง
    shade = (0.62 + 0.38 * ((1 + np.cos(2 * np.pi * r * 4)) / 2) ** 0.8) * (0.78 + 0.22 * sag**0.5)
    shade = np.where(yy < top + head, 0.92, shade)  # แถบหัวม่าน
    put(in_swag, _sample(tex, xx - sx0, r * bh * 0.6) * shade[..., None])
    m, col = _tassels(xx - sx0, yy - hem, fr, pitch, trim)
    m &= (xx >= sx0) & (xx <= sx1)
    put(m, col)
    solid |= m

    # 3) หางห้อยสองข้าง: ด้านนอกยาว ด้านในสั้น ปลายเฉียง
    for x0, d in ((left, 1.0), (right, -1.0)):
        s = (xx - x0) * d
        t = np.clip(s / jab_w, 0, 1)
        jhem = top + (0.8 - 0.45 * t) * bh
        inside = (s >= 0) & (s <= jab_w) & (yy >= top) & (yy <= jhem)
        theta = 2 * np.pi * s / (jab_w / 3)
        put(inside, _sample(tex, s * 2.5 * d, yy - top) * _folds(theta, d)[..., None])
        m, col = _tassels(s, yy - jhem, fr, pitch, trim)
        m &= (s >= 0) & (s <= jab_w)
        put(m, col)
        solid |= m

    return rgb, mask, solid


_DRAW = {"pleated": _pleated, "roller": _roller, "louis": _louis}


# ---------- กรอบ 4 มุม ↔ กรอบตรง ----------


def _frame(
    quad: Quad,
    img_h: int,
    floor_pt: tuple[float, float] | None = None,
    rail_pt: tuple[float, float] | None = None,
) -> tuple[Frame, np.ndarray]:
    """สร้างกรอบตรงของจุดนี้ + homography จากกรอบตรง → รูปห้อง
    floor_pt / rail_pt = จุดบนแนวพื้น / แนวรางที่ลูกค้าวาง (พิกเซล) ถ้าไม่มีใช้ขอบล่างของรูป / เหนือหน้าต่าง 10%"""
    q = np.float32(quad)
    tl, tr, br, bl = q
    bw = (np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2
    bh = (np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2
    mx = 0.4 * bw

    def layout(mt: float):
        box = (mx, mt, mx + bw, mt + bh)
        src = np.float32([[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]])
        return box, cv2.getPerspectiveTransform(src, q)

    def to_y(Hm: np.ndarray, pt) -> float:
        # ราง/พื้นอยู่บนระนาบผนังเดียวกับหน้าต่าง → แปลงกลับเป็น y ในกรอบตรง (แนวจึงเอียงตามผนัง)
        p = np.linalg.inv(Hm) @ np.array([pt[0], pt[1], 1.0])
        return p[1] / p[2] if p[2] > 1e-6 else np.nan

    mt = 0.3 * bh
    box, Hm = layout(mt)
    rail = to_y(Hm, rail_pt) if rail_pt is not None else np.nan
    rail = float(np.clip(rail if np.isfinite(rail) else mt - 0.1 * bh, mt - 1.5 * bh, mt + 0.5 * bh))
    if rail < 0.04 * bh:  # รางสูงเลยขอบบนของกรอบตรง → ขยายพื้นที่ด้านบน
        mt += 0.04 * bh - rail
        rail = 0.04 * bh
        box, Hm = layout(mt)

    mid = (bl + br) / 2
    floor = to_y(Hm, floor_pt if floor_pt is not None else (mid[0], img_h - 1))
    floor = float(np.clip(floor if np.isfinite(floor) else mt + 3 * bh, mt + 1.02 * bh, mt + 6 * bh))

    Hc, Wc = int(floor + 0.05 * bh + 2), int(bw + 2 * mx)
    s = min(1.0, MAX_FRAME_SIDE / max(Hc, Wc))
    if s < 1:
        box = tuple(v * s for v in box)
        floor *= s
        rail *= s
        Hc, Wc = int(Hc * s), int(Wc * s)
        Hm = Hm @ np.diag([1 / s, 1 / s, 1.0])
    return Frame(shape=(Hc, Wc), box=box, floor=floor, rail=rail), Hm


def quad_bbox(quad: Quad) -> tuple[float, float, float, float]:
    q = np.float32(quad)
    return float(q[:, 0].min()), float(q[:, 1].min()), float(q[:, 0].max()), float(q[:, 1].max())


def render(
    room_img: Image.Image,
    swatch: Image.Image,
    style: str,
    quads: list[Quad],
    o: Options,
    window_mask: np.ndarray | None = None,
    floors: list[tuple[float, float] | None] | None = None,
    rails: list[tuple[float, float] | None] | None = None,
) -> Rendered:
    """วาดม่านแบบเดียวกันลงทุกจุด (quads = กรอบ 4 มุมเป็นพิกเซล, floors/rails = จุดพื้น/จุดรางของแต่ละจุด)"""
    original = np.asarray(room_img, np.float32) / 255
    room = original.copy()
    H, W = room.shape[:2]
    total = np.zeros((H, W), np.float32)
    opacity = OPACITY.get(o.light_filter or "", 0.97)
    luma = original @ np.array([0.299, 0.587, 0.114], np.float32)

    for i, quad in enumerate(quads):
        frame, Hm = _frame(quad, H, floors[i] if floors else None, rails[i] if rails else None)
        x1, _, x2, _ = frame.box
        bw = x2 - x1
        px_per_cm = bw / (o.window_width_cm or DEFAULT_WINDOW_CM)
        tile = int(np.clip((o.repeat_cm or DEFAULT_REPEAT_CM) * px_per_cm, 20, max(21, 0.7 * bw)))
        rgb, mask, solid = _DRAW[style](frame, _texture(swatch, tile), o)

        # บิดจากกรอบตรงไปตามมุมมองของกรอบ 4 มุมในรูป
        warp = lambda a: cv2.warpPerspective(a, Hm, (W, H), flags=cv2.INTER_LINEAR)  # noqa: E731
        rgb = warp(rgb)
        soft = cv2.GaussianBlur(warp(mask.astype(np.float32)), (0, 0), 0.8)
        hard = warp(solid.astype(np.float32))

        bbox = quad_bbox(quad)
        rgb *= _light_factor(original, bbox)
        if window_mask is not None:
            glow = cv2.GaussianBlur(window_mask.astype(np.float32), (0, 0), max(2.0, (bbox[2] - bbox[0]) * 0.02))
            rgb *= 1 + TRANSMIT.get(o.light_filter or "", 0.05) * (glow * luma)[..., None]

        # เงาผ้าตกบนผนังด้านหลัง
        qw = bbox[2] - bbox[0]
        shift = np.float32([[1, 0, 0.012 * qw], [0, 1, 0.01 * qw]])
        shadow = cv2.GaussianBlur(cv2.warpAffine(soft, shift, (W, H)), (0, 0), max(2.0, 0.02 * qw))
        room *= (1 - 0.3 * shadow * (1 - soft))[..., None]

        alpha = (soft * (opacity + (1 - opacity) * hard))[..., None]
        room = room * (1 - alpha) + np.clip(rgb, 0, 1) * alpha
        total = np.maximum(total, soft)

    image = Image.fromarray((np.clip(room, 0, 1) * 255).astype(np.uint8))
    return Rendered(image=image, mask=total)
