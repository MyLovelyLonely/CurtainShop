"""วาดรูปลายผ้า (ปูต่อกันได้) ตามชนิดลาย + สี สำหรับข้อมูลตัวอย่าง"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

N = 512
yy, xx = np.mgrid[0:N, 0:N] / N


def rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


def weave(base: str, amt: float = 0.06, seed: int = 0, slub: float = 0.5) -> np.ndarray:
    """เนื้อผ้าทอ: เส้นด้ายแนวตั้ง/นอน + ปุ่มด้าย + noise"""
    r = np.random.default_rng(seed)
    warp = np.sin(xx * N * np.pi / 2.0) * 0.5 + np.sin(yy * N * np.pi / 2.0) * 0.5
    sl = r.normal(0, 1, (N, 1)) * slub + r.normal(0, 1, (1, N)) * slub
    t = (warp * 0.4 + sl + r.normal(0, 1, (N, N)) * 0.3) * amt
    return np.clip(rgb(base)[None, None, :] * (1 + t[..., None]), 0, 1)


def mix(a: np.ndarray, color: str, m: np.ndarray) -> np.ndarray:
    return a * (1 - m[..., None]) + rgb(color)[None, None, :] * m[..., None]


def mask(shapes, blur: float = 1.2) -> np.ndarray:
    """วาดรูปทรงซ้ำ 9 ตำแหน่ง (เลื่อน ±N) ให้ลายต่อขอบได้"""
    im = Image.new("L", (N, N), 0)
    d = ImageDraw.Draw(im)
    for ox in (-N, 0, N):
        for oy in (-N, 0, N):
            shapes(d, ox, oy)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(blur)), np.float32) / 255


def save(arr: np.ndarray, path: str):
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(path, quality=88)


# ---------- ชนิดลาย: draw(colors: list[str], seed) → array ----------


def plain(c, seed):
    return weave(c[0], 0.05, seed)


def blackout(c, seed):  # ผ้าหนา เนื้อแน่น
    return weave(c[0], 0.035, seed, slub=0.3)


def linen(c, seed):  # ปุ่มด้ายชัด
    return weave(c[0], 0.09, seed, slub=0.9)


def sheer(c, seed):
    b = weave(c[0], 0.03, seed)
    grid = ((np.sin(xx * N * np.pi / 3) > 0.92) | (np.sin(yy * N * np.pi / 3) > 0.92)).astype(np.float32)
    return mix(b, c[1] if len(c) > 1 else c[0], grid * 0.5)


def stripe(c, seed):
    widths = [48, 18, 10, 6][: max(2, len(c) + 1)]
    period, x = sum(widths), (xx * N) % sum(widths)
    arr, edge = weave(c[0], 0.05, seed), 0
    for i, w in enumerate(widths):
        arr = mix(arr, c[i % len(c)], ((x >= edge) & (x < edge + w)).astype(np.float32) * 0.95)
        edge += w
    return arr


def herringbone(c, seed):
    col = (xx * 16).astype(int)
    hb = (((col + (yy * 32).astype(int) * (col % 2 * 2 - 1)) % 4) < 2).astype(np.float32)
    return mix(weave(c[0], 0.05, seed), c[1], hb * 0.7)


def damask(c, seed):
    r = np.hypot((xx * 4 % 1) - 0.5, ((yy * 4 + 0.5 * (np.floor(xx * 4) % 2)) % 1 - 0.5) * 0.8)
    th = np.arctan2((yy * 4 % 1) - 0.5, (xx * 4 % 1) - 0.5)
    m = ((r < 0.18 + 0.12 * np.cos(4 * th)) & (r > 0.05)) | (r < 0.03)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)), np.float32) / 255
    return mix(weave(c[0], 0.04, seed), c[1], m * 0.9)


def medallion(c, seed):  # แจ็คการ์ดลายเหรียญวงกลมซ้อน
    r = np.hypot((xx * 3 % 1) - 0.5, (yy * 3 % 1) - 0.5)
    m = ((np.abs(r - 0.3) < 0.03) | (np.abs(r - 0.18) < 0.025) | (r < 0.06)).astype(np.float32)
    return mix(weave(c[0], 0.04, seed), c[1], m * 0.85)


def leaves(c, seed):
    rng = np.random.default_rng(seed)
    pts = [(rng.uniform(0, N), rng.uniform(0, N), rng.uniform(0, 180), rng.uniform(30, 60)) for _ in range(24)]

    def shapes(d, ox, oy):
        for x, y, ang, L in pts:
            a, t = np.deg2rad(ang), np.linspace(0, 1, 30)
            w = np.sin(np.pi * t) * L * 0.32
            px, py = np.concatenate([t * L, (t * L)[::-1]]), np.concatenate([w, -w[::-1]])
            d.polygon(list(zip(px * np.cos(a) - py * np.sin(a) + x + ox, px * np.sin(a) + py * np.cos(a) + y + oy)), fill=255)

    return mix(weave(c[0], 0.04, seed), c[1], mask(shapes))


def floral(c, seed):
    rng = np.random.default_rng(seed)
    pts = [(rng.uniform(0, N), rng.uniform(0, N), rng.uniform(22, 40)) for _ in range(14)]

    def petals(d, ox, oy):
        for x, y, r in pts:
            for k in range(6):
                a = k * np.pi / 3
                px, py = x + ox + np.cos(a) * r * 0.9, y + oy + np.sin(a) * r * 0.9
                d.ellipse([px - r * 0.62, py - r * 0.62, px + r * 0.62, py + r * 0.62], fill=255)

    def cores(d, ox, oy):
        for x, y, r in pts:
            d.ellipse([x + ox - r * 0.35, y + oy - r * 0.35, x + ox + r * 0.35, y + oy + r * 0.35], fill=255)

    return mix(mix(weave(c[0], 0.04, seed), c[1], mask(petals)), c[2] if len(c) > 2 else "#f1d36b", mask(cores))


def chevron(c, seed):
    z = np.abs(((xx * 8) % 1) - 0.5) * 2
    return mix(weave(c[0], 0.05, seed), c[1], (((yy * 8 + z * 0.5) % 1) < 0.35).astype(np.float32) * 0.9)


def check(c, seed):
    arr = weave(c[0], 0.05, seed)
    for pos, w, a in ((0, 30, 0.45), (64, 4, 0.6)):
        m = np.clip((np.abs(((xx * N - pos) % 128)) < w).astype(np.float32) * a + (np.abs(((yy * N - pos) % 128)) < w).astype(np.float32) * a, 0, 0.85)
        arr = mix(arr, c[1], m)
    return arr


def plaid(c, seed):
    arr = weave(c[0], 0.05, seed)
    for col, pos, w, a in ((c[1], 0, 22, 0.55), (c[2], 64, 3, 0.7), ("#10131a", 96, 8, 0.5)):
        m = np.clip((np.abs(((xx * N - pos) % 128)) < w).astype(np.float32) * a + (np.abs(((yy * N - pos) % 128)) < w).astype(np.float32) * a, 0, 0.85)
        arr = mix(arr, col, m)
    return arr


def stars(c, seed):
    rng = np.random.default_rng(seed)
    pts = [(rng.uniform(0, N), rng.uniform(0, N), rng.uniform(12, 22)) for _ in range(26)]

    def shapes(d, ox, oy):
        for x, y, s in pts:
            d.polygon([(x + ox + s * np.cos(np.pi / 2 + k * np.pi / 5) * (1 if k % 2 == 0 else 0.45),
                        y + oy - s * np.sin(np.pi / 2 + k * np.pi / 5) * (1 if k % 2 == 0 else 0.45)) for k in range(10)], fill=255)

    return mix(weave(c[0], 0.04, seed), c[1], mask(shapes))


def polka(c, seed):
    rng = np.random.default_rng(seed)
    pts = [(rng.uniform(0, N), rng.uniform(0, N)) for _ in range(30)]
    return mix(weave(c[0], 0.04, seed), c[1], mask(lambda d, ox, oy: [d.ellipse([x + ox - 11, y + oy - 11, x + ox + 11, y + oy + 11], fill=255) for x, y in pts]))


DRAW = {f.__name__: f for f in (plain, blackout, linen, sheer, stripe, herringbone, damask, medallion, leaves, floral, chevron, check, plaid, stars, polka)}
