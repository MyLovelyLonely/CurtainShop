// ผลค้นหาสินค้า (หัวข้อ 2.2–2.3)

import type { ProductView } from "./catalog";

export type SearchResult = {
  /** "ai" = จัดอันดับด้วย ai-server, "fallback" = ai-server ใช้ไม่ได้ ค้นจากคำที่ตรงกันแทน */
  mode: "ai" | "fallback";
  /** เรียงจากเกี่ยวข้องมากไปน้อย; via = วิธีที่เจอ (keyword / semantic / structured / visual / image) */
  products: (ProductView & { score: number; via: string[] })[];
  /** เงื่อนไขที่สกัดได้จากคำค้น เช่น สี ประเภทลาย การกรองแสง หมวด (fabric/accessory) ราคา (cheap / max:500) */
  filters?: { colors: string[]; patterns: string[]; lights: string[]; category?: string[]; price?: string[] };
  notice?: string;
};
