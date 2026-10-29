// เรียก FastAPI (ai-server)

const AI_URL = process.env.AI_SERVER_URL ?? "http://localhost:8000";

export type AiResult = { ok: true; data: unknown } | { ok: false; error: string };

export async function aiPost(path: string, body: unknown, timeoutMs = 15_000): Promise<AiResult> {
  try {
    const res = await fetch(`${AI_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, error: `AI server ตอบ ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ติดต่อ AI server ไม่ได้" };
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
    return { ok: false, error: e instanceof Error ? e.message : "ติดต่อ AI server ไม่ได้" };
  }
}

/** สร้าง embedding ใหม่ของสินค้าที่เพิ่ม/แก้ */
export const reembedProducts = (productIds: number[]) =>
  aiPost("/ai/catalog/reembed", { product_ids: productIds });
