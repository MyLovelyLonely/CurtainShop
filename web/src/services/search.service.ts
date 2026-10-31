// ค้นหาสินค้าด้วยข้อความ / รูปภาพ (หัวข้อ 2.2–2.3): ให้ ai-server จัดอันดับ แล้วคืนข้อมูลสินค้าตามลำดับนั้น

import { HttpError } from "@/lib/api";
import { searchImage, searchText, type SearchHit } from "@/lib/ai-client";
import { listProducts } from "@/services/catalog.service";
import type { ProductView } from "@/types/catalog";
import type { SearchResult } from "@/types/search";

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(jpeg|png|webp)$/;

async function withProducts(hits: SearchHit[]): Promise<SearchResult["products"]> {
  const byId = new Map((await listProducts({ visibleOnly: true })).map((p) => [p.product_id, p]));
  return hits.flatMap((h) => {
    const p = byId.get(h.product_id);
    return p ? [{ ...p, score: h.score, via: h.via }] : [];
  });
}

/** สำรองเมื่อ ai-server ใช้ไม่ได้: หาคำค้นทุกคำในข้อมูลสินค้า */
function keywordFallback(products: ProductView[], q: string): SearchResult["products"] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return products
    .filter((p) => {
      const d = p.details;
      const hay = [p.name, p.description, d.code, d.collection, d.pattern_name, d.pattern_type, d.composition, d.care, ...d.colors, ...d.tags]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .map((p) => ({ ...p, score: 0, via: ["fallback"] }));
}

export async function searchByText(q: string): Promise<SearchResult> {
  const query = q.trim().slice(0, 200);
  if (!query) throw new HttpError(400, "กรุณาพิมพ์คำค้นหา");
  const res = await searchText(query);
  if (res.ok) {
    const data = res.data as { results: SearchHit[]; filters: SearchResult["filters"]; notice?: string | null };
    return { mode: "ai", products: await withProducts(data.results), filters: data.filters, notice: data.notice ?? undefined };
  }
  console.error("ค้นหาด้วย AI ไม่สำเร็จ:", res.error);
  return {
    mode: "fallback",
    products: keywordFallback(await listProducts({ visibleOnly: true }), query),
    notice: "ระบบค้นหาด้วย AI ไม่พร้อมใช้งาน จึงค้นจากคำที่ตรงกันแทน",
  };
}

export async function searchByImage(form: FormData): Promise<SearchResult> {
  const file = form.get("image");
  if (!(file instanceof File) || !file.size) throw new HttpError(400, "กรุณาเลือกรูปภาพ");
  if (!IMAGE_TYPES.test(file.type)) throw new HttpError(400, "รองรับเฉพาะรูป JPG, PNG หรือ WEBP");
  if (file.size > MAX_BYTES) throw new HttpError(400, "รูปใหญ่เกิน 10MB");
  const res = await searchImage(file);
  if (!res.ok) throw new HttpError(502, `ค้นหาด้วยรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง (${res.error})`);
  const data = res.data as { results: SearchHit[] };
  return { mode: "ai", products: await withProducts(data.results) };
}
