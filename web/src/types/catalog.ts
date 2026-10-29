// ข้อมูลสินค้าที่เก็บใน product.details (jsonb) + ตัวเลือกที่ใช้ร่วมกันทั้งฝั่งแอดมินและลูกค้า

import type { Catalog, Category, Product } from "./db";

// ชั่วคราวช่วงทดสอบ OCR: กำหนดหมวดหมู่ในโค้ดแทนการอ่านจากตาราง category
// category_id ต้องตรงกับแถว "ผ้าม่าน" ในตาราง category ตอนบันทึกจริง
export const CATEGORIES: Category[] = [{ category_id: 1, name: "ผ้าม่าน" }];

export const LIGHT_FILTERS = {
  sheer: "โปร่งแสง (Sheer)",
  dimout: "กรองแสงบางส่วน (Dim-out)",
  blackout: "ทึบแสง (Blackout)",
} as const;

export type LightFilter = keyof typeof LIGHT_FILTERS;

export const PATTERN_TYPES = [
  "ลายเรียบ (Plain)",
  "ลายผ้า/เท็กซ์เจอร์ (Texture)",
  "ลายทาง (Stripe)",
  "ลายดอก (Floral)",
  "ลายเรขาคณิต (Geometric)",
  "ลายดามัสก์ (Damask)",
  "ลายใบไม้ (Botanical)",
  "ลายเด็ก (Kids)",
];

export const PRICE_UNITS = ["หลา", "เมตร", "ตร.ม.", "ชุด", "ชิ้น"];

export type ProductDetails = {
  code: string;
  collection: string | null;
  pattern_name: string | null;
  pattern_type: string | null;
  colors: string[];
  composition: string | null;
  width_cm: number | null;
  repeat_cm: number | null;
  light_filter: LightFilter | null;
  tags: string[];
  care: string | null;
  images: string[];
};

/** ข้อมูลสินค้าที่ฟอร์มส่งมา (ยังไม่มีรูป รูปส่งแยกเป็นไฟล์) */
export type ProductInput = {
  code: string;
  name: string;
  collection: string;
  pattern_name: string;
  pattern_type: string;
  colors: string[];
  composition: string;
  width_cm: number | null;
  repeat_cm: number | null;
  light_filter: LightFilter | "";
  base_price: number | null;
  price_unit: string;
  tags: string[];
  description: string;
  care: string;
};

export type ProductView = Omit<Product, "details" | "description"> & {
  description: string | null;
  details: ProductDetails;
};

export type CatalogView = Catalog & {
  category: Category | null;
  product_count: number;
};

export type CatalogInput = {
  name: string;
  category_id: number | null;
  description: string;
  is_visible: boolean;
};

export const emptyProductInput = (): ProductInput => ({
  code: "",
  name: "",
  collection: "",
  pattern_name: "",
  pattern_type: "",
  colors: [],
  composition: "",
  width_cm: null,
  repeat_cm: null,
  light_filter: "",
  base_price: null,
  price_unit: "หลา",
  tags: [],
  description: "",
  care: "",
});

/** แยกข้อความคั่นด้วย , หรือ ขึ้นบรรทัดใหม่ เป็นรายการ */
export const splitList = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export const formatPrice = (n: number) =>
  n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

/**
 * next/image ย่อรูปได้เฉพาะ host ที่ตั้งไว้ใน next.config (Supabase Storage / R2) ถ้าเป็น host อื่น
 * (เช่น URL ในข้อมูลตั้งต้น) จะ throw ทั้งหน้า → ใส่ unoptimized={!canOptimize(src)} ให้แสดงรูปตรง ๆ แทน
 */
export const canOptimize = (src: string) =>
  /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//.test(src) ||
  /^https:\/\/[^/]+\.r2\.dev\//.test(src);
