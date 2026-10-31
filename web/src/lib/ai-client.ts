// เรียก FastAPI (ai-server)

const AI_URL = process.env.AI_SERVER_URL ?? "http://localhost:8000";

/** fetch ล้มเพราะต่อ ai-server ไม่ได้ (เช่น ยังไม่ได้เปิด) → ข้อความที่อ่านเข้าใจ แทน "fetch failed" */
// (fetch ฝั่งเซิร์ฟเวอร์ของ Next อาจโยน TypeError จากอีก realm → instanceof ใช้ไม่ได้ จึงดูที่ name)
const networkError = (e: unknown) =>
  e instanceof Error && e.name === "TypeError"
    ? `ติดต่อ AI server ที่ ${AI_URL} ไม่ได้ (เปิด ai-server หรือยัง?)`
    : e instanceof Error
      ? e.message
      : "ติดต่อ AI server ไม่ได้";

export type AiResult = { ok: true; data: unknown } | { ok: false; error: string };

export async function aiPost(path: string, body: unknown, timeoutMs = 15_000): Promise<AiResult> {
  try {
    const res = await fetch(`${AI_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      // FastAPI ส่งเหตุผลมาใน detail (เช่น 400 จาก HTTPException)
      const detail = await res.json().then((b) => b?.detail, () => null);
      return { ok: false, error: `AI server ตอบ ${res.status}${typeof detail === "string" ? `: ${detail}` : ""}` };
    }
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, error: networkError(e) };
  }
}

/** PDF/รูปแคตตาล็อก → OCR + บรรยายลาย → สร้างสินค้า + embedding */
export const ingestCatalog = (catalogId: number, fileUrl: string) =>
  aiPost("/ai/catalog/ingest", { catalog_id: catalogId, file_url: fileUrl });

/** ทดสอบ OCR: ให้ AI อ่านไฟล์แล้วคืนสินค้าที่อ่านได้ (ไม่บันทึก) — ใช้เวลาประมาณ 10–15 วินาที/หน้า */
export async function extractCatalog(file: File): Promise<AiResult> {
  const form = new FormData();
  form.set("file", file);
  try {
    const res = await fetch(`${AI_URL}/ai/catalog/extract`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(15 * 60_000),
    });
    if (!res.ok) return { ok: false, error: `AI server ตอบ ${res.status}: ${await res.text()}` };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, error: networkError(e) };
  }
}

/** สร้าง embedding ใหม่ของสินค้าที่เพิ่ม/แก้ */
export const reembedProducts = (productIds: number[]) =>
  aiPost("/ai/catalog/reembed", { product_ids: productIds });

/** ส่งไฟล์ (multipart field "file") ให้ ai-server */
async function aiPostFile(path: string, file: Blob, name: string, timeoutMs: number): Promise<AiResult> {
  const form = new FormData();
  form.set("file", file, name);
  try {
    const res = await fetch(`${AI_URL}${path}`, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      const detail = await res.json().then((b) => b?.detail, () => null);
      return { ok: false, error: `AI server ตอบ ${res.status}${typeof detail === "string" ? `: ${detail}` : ""}` };
    }
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, error: networkError(e) };
  }
}

/** YOLOv11 หากรอบหน้าต่างในรูปห้อง — ส่งไฟล์ตรง ๆ จะได้ทำพร้อมกับอัปขึ้น R2 (เผื่อเวลาตอนโหลดโมเดลครั้งแรก) */
export const detectWindows = (photo: Blob) => aiPostFile("/ai/window/detect-file", photo, "room.jpg", 120_000);

/** SAM2 + วาดม่านจากลายผ้า + Stable Diffusion/IP-Adapter → รูป JPEG base64 */
export const renderCurtain = (body: {
  image_url: string;
  swatch_url: string;
  style: string;
  regions: { quad: [number, number][]; floor: [number, number]; rail: [number, number] }[];
  open_ratio: number;
  length: string;
  drop: number;
  width_scale: number;
  height_scale: number;
  fold_scale: number;
  pattern_scale: number;
  light_filter: string | null;
  repeat_cm: number | null;
}) => aiPost("/ai/simulate/render", body, 5 * 60_000);

export type RenderBody = Parameters<typeof renderCurtain>[0];

/** ภาพร่างสำหรับดูตัวอย่างสด (ไม่เกลาด้วย AI) → JPEG; signal = ยกเลิกเมื่อลูกค้าปรับค่าใหม่แล้ว */
export async function previewCurtain(
  body: RenderBody,
  signal: AbortSignal,
): Promise<{ ok: true; data: ArrayBuffer } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${AI_URL}/ai/simulate/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!res.ok) return { ok: false, error: `AI server ตอบ ${res.status}` };
    return { ok: true, data: await res.arrayBuffer() };
  } catch (e) {
    return { ok: false, error: networkError(e) };
  }
}

export type SearchHit = { product_id: number; score: number; via: string[] };

/** ค้นด้วยข้อความ: BGE-M3 + BM25 + คำค้นเชิงโครงสร้าง + OpenCLIP → RRF (ครั้งแรกต้องโหลดโมเดล จึงเผื่อเวลา) */
export const searchText = (q: string) => aiPost("/ai/search/text", { q, limit: 500 }, 120_000);

/** ค้นด้วยรูปอ้างอิง: OpenCLIP */
export const searchImage = (image: Blob) => aiPostFile("/ai/search/image", image, "query.jpg", 120_000);
