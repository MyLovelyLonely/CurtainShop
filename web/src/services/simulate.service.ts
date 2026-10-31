// จำลองผ้าม่าน: รูปห้องของลูกค้า + ลายผ้าของสินค้าในฐานข้อมูล → ai-server → เก็บรูปทั้งก่อน/หลังไว้ใน R2

import { HttpError } from "@/lib/api";
import { detectWindows, previewCurtain, renderCurtain, type RenderBody } from "@/lib/ai-client";
import { isR2Url, putR2 } from "@/lib/r2";
import { getProduct } from "@/services/catalog.service";
import {
  CURTAIN_STYLES,
  MAX_REGIONS,
  quadArea,
  type CurtainStyle,
  type Point,
  type Quad,
  type Region,
  type RenderInput,
  type RenderResult,
  type SimulatePhoto,
} from "@/types/simulate";

const MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** อัปโหลดรูปห้องไป R2 และให้ YOLOv11 หากรอบหน้าต่างเบื้องต้น (ทำพร้อมกัน) */
export async function uploadRoomPhoto(form: FormData): Promise<SimulatePhoto> {
  const file = form.get("photo");
  if (!(file instanceof File) || !file.size) throw new HttpError(400, "กรุณาเลือกรูปห้อง");
  const ext = PHOTO_TYPES[file.type];
  if (!ext) throw new HttpError(400, "รองรับเฉพาะรูป JPG, PNG หรือ WEBP");
  if (file.size > MAX_BYTES) throw new HttpError(400, "รูปใหญ่เกิน 10MB");

  const [photo_url, res] = await Promise.all([
    putR2(`simulations/rooms/${crypto.randomUUID()}.${ext}`, new Uint8Array(await file.arrayBuffer()), file.type),
    detectWindows(file),
  ]);
  if (res.ok) return { photo_url, ...(res.data as Omit<SimulatePhoto, "photo_url">) };

  // หาหน้าต่างอัตโนมัติไม่ได้ (เช่น ai-server ไม่ได้เปิด) → ยังแสดงรูปให้ลากกรอบเองได้ ขนาดรูปใช้ค่าที่หน้าเว็บส่งมา
  console.error("ตรวจหาหน้าต่างไม่สำเร็จ:", res.error);
  return {
    photo_url,
    width: clamp(form.get("width"), 1, 10_000, 1200),
    height: clamp(form.get("height"), 1, 10_000, 900),
    windows: [],
    detector: "unavailable",
  };
}

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const point = (p: unknown): Point => {
  const a = Array.isArray(p) ? p : [];
  return [clamp(a[0], 0, 1, NaN), clamp(a[1], 0, 1, NaN)];
};

function parseRegions(v: unknown): Region[] {
  if (!Array.isArray(v) || !v.length) throw new HttpError(400, "กรุณาวางกรอบหน้าต่างอย่างน้อย 1 จุด");
  if (v.length > MAX_REGIONS) throw new HttpError(400, `จำลองได้สูงสุด ${MAX_REGIONS} จุดต่อรูป`);
  return v.map((r, i) => {
    const q = (r as Partial<Region>)?.quad;
    if (!Array.isArray(q) || q.length !== 4) throw new HttpError(400, `กรอบที่ ${i + 1} ไม่ถูกต้อง`);
    const quad = q.map(point) as Quad;
    if (quad.flat().some(Number.isNaN) || quadArea(quad) < 0.001)
      throw new HttpError(400, `กรอบที่ ${i + 1} เล็กเกินไปหรือมุมไขว้กัน`);
    const floor = point((r as Partial<Region>).floor);
    if (floor.some(Number.isNaN)) throw new HttpError(400, `จุดพื้นของกรอบที่ ${i + 1} ไม่ถูกต้อง`);
    const rail = point((r as Partial<Region>).rail);
    if (rail.some(Number.isNaN)) throw new HttpError(400, `จุดรางของกรอบที่ ${i + 1} ไม่ถูกต้อง`);
    return { quad, floor, rail };
  });
}

/** ตรวจค่าที่หน้าเว็บส่งมา + ดึงลายผ้า/การกรองแสงจากสินค้าจริง → ข้อมูลที่ส่งให้ ai-server */
async function renderBody(body: Partial<RenderInput>, recent = false): Promise<RenderBody> {
  const style = body.style as CurtainStyle;
  if (!(style in CURTAIN_STYLES)) throw new HttpError(400, "รูปแบบม่านไม่ถูกต้อง");
  if (typeof body.photo_url !== "string" || !isR2Url(body.photo_url))
    throw new HttpError(400, "กรุณาอัปโหลดรูปห้องใหม่อีกครั้ง");
  const productId = Number(body.product_id);
  if (!Number.isInteger(productId) || productId <= 0) throw new HttpError(400, "กรุณาเลือกสินค้า");

  // ลายผ้าและค่าการกรองแสงมาจากสินค้าจริงในฐานข้อมูล
  const product = await (recent ? recentProduct(productId) : getProduct(productId, true));
  const swatch = product.details.images[0] ?? product.image_url;
  if (!swatch) throw new HttpError(400, "สินค้านี้ยังไม่มีรูปลายผ้า จึงจำลองไม่ได้");

  return {
    image_url: body.photo_url,
    swatch_url: swatch,
    style,
    regions: parseRegions(body.regions),
    open_ratio: clamp(body.open_ratio, 0, 1, 0.35),
    length: body.length === "sill" ? "sill" : "floor",
    drop: clamp(body.drop, 0.05, 1, 0.7),
    width_scale: clamp(body.width_scale, 0.5, 2, 1),
    height_scale: clamp(body.height_scale, 0.5, 1.5, 1),
    fold_scale: clamp(body.fold_scale, 0.5, 2, 1),
    pattern_scale: clamp(body.pattern_scale, 0.5, 2, 1),
    light_filter: product.details.light_filter,
    repeat_cm: product.details.repeat_cm,
  };
}

/** จำลองม่าน 1 แบบ แล้วเก็บรูปผลลัพธ์ไว้ใน R2 */
export async function renderSimulation(body: Partial<RenderInput>): Promise<RenderResult> {
  const res = await renderCurtain(await renderBody(body));
  if (!res.ok) throw new HttpError(502, `สร้างภาพจำลองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง (${res.error})`);

  const data = res.data as Omit<RenderResult, "result_url"> & { image: string };
  const result_url = await putR2(
    `simulations/results/${crypto.randomUUID()}.jpg`,
    Buffer.from(data.image, "base64"),
    "image/jpeg",
  );
  return { result_url, refined: data.refined, mask_source: data.mask_source, note: data.note };
}

/** ภาพร่างสำหรับดูตัวอย่างสดระหว่างลูกค้าปรับค่า (ไม่เกลาด้วย AI ไม่เก็บลง R2) → JPEG */
export async function previewSimulation(body: Partial<RenderInput>, signal: AbortSignal): Promise<Response> {
  const res = await previewCurtain(await renderBody(body, true), signal);
  if (!res.ok) throw new HttpError(502, `แสดงตัวอย่างไม่สำเร็จ (${res.error})`);
  return new Response(res.data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
}

// ตัวอย่างสดขอถี่ (ทุกครั้งที่ลาก) จึงจำสินค้าไว้สั้น ๆ ไม่ต้องถามฐานข้อมูลทุกครั้ง
const products = new Map<number, { at: number; product: ReturnType<typeof getProduct> }>();
function recentProduct(id: number): ReturnType<typeof getProduct> {
  const hit = products.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.product;
  const product = getProduct(id, true);
  products.set(id, { at: Date.now(), product });
  product.catch(() => products.delete(id));
  return product;
}
