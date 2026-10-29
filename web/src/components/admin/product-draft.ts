// สถานะฟอร์มสินค้าฝั่งแอดมิน (เก็บเป็นข้อความทั้งหมดเพื่อให้พิมพ์ได้อิสระ) + นำเข้า CSV

import {
  LIGHT_FILTERS,
  splitList,
  type LightFilter,
  type ProductInput,
  type ProductView,
} from "@/types/catalog";

export type ProductDraft = {
  key: string;
  code: string;
  name: string;
  collection: string;
  pattern_name: string;
  pattern_type: string;
  colors: string;
  composition: string;
  width_cm: string;
  repeat_cm: string;
  light_filter: LightFilter | "";
  base_price: string;
  price_unit: string;
  tags: string;
  description: string;
  care: string;
  /** รูปเดิม (ตอนแก้ไข) */
  existingImages: string[];
  /** รูปใหม่ที่เลือก */
  newImages: File[];
  /** ข้อสังเกตจาก AI ว่าควรตรวจอะไร (แสดงในฟอร์มเท่านั้น ไม่บันทึก) */
  review?: string[];
};

let seq = 0;

/** key ของแถวในฟอร์ม (ใช้แค่ฝั่ง client) */
export const draftKey = () => `p${++seq}`;

export const newDraft = (patch: Partial<ProductDraft> = {}): ProductDraft => ({
  key: draftKey(),
  code: "",
  name: "",
  collection: "",
  pattern_name: "",
  pattern_type: "",
  colors: "",
  composition: "",
  width_cm: "",
  repeat_cm: "",
  light_filter: "",
  base_price: "",
  price_unit: "หลา",
  tags: "",
  description: "",
  care: "",
  existingImages: [],
  newImages: [],
  ...patch,
});

export const draftFromProduct = (p: ProductView): ProductDraft =>
  newDraft({
    code: p.details.code,
    name: p.name,
    collection: p.details.collection ?? "",
    pattern_name: p.details.pattern_name ?? "",
    pattern_type: p.details.pattern_type ?? "",
    colors: p.details.colors.join(", "),
    composition: p.details.composition ?? "",
    width_cm: p.details.width_cm?.toString() ?? "",
    repeat_cm: p.details.repeat_cm?.toString() ?? "",
    light_filter: p.details.light_filter ?? "",
    base_price: p.base_price.toString(),
    price_unit: p.price_unit,
    tags: p.details.tags.join(", "),
    description: p.description ?? "",
    care: p.details.care ?? "",
    existingImages: p.details.images,
  });

/** สินค้าที่ AI อ่านได้จาก /api/admin/catalogs/extract */
export type ExtractedProduct = Pick<ProductView, "name" | "base_price" | "price_unit" | "description"> & {
  details: Omit<ProductView["details"], "images">;
  swatch: string | null;
  review: string[];
  page: number;
};

export async function draftFromExtracted(p: ExtractedProduct): Promise<ProductDraft> {
  const d = p.details;
  const images = p.swatch
    ? [new File([await (await fetch(p.swatch)).blob()], `${d.code || "swatch"}.jpg`, { type: "image/jpeg" })]
    : [];
  return newDraft({
    code: d.code ?? "",
    name: p.name ?? "",
    collection: d.collection ?? "",
    pattern_name: d.pattern_name ?? "",
    pattern_type: d.pattern_type ?? "",
    colors: (d.colors ?? []).join(", "),
    composition: d.composition ?? "",
    width_cm: d.width_cm?.toString() ?? "",
    repeat_cm: d.repeat_cm?.toString() ?? "",
    light_filter: d.light_filter ?? "",
    base_price: p.base_price ? p.base_price.toString() : "",
    price_unit: p.price_unit || "หลา",
    tags: (d.tags ?? []).join(", "),
    description: p.description ?? "",
    care: d.care ?? "",
    newImages: images,
    review: p.review.map((r) => `หน้า ${p.page}: ${r}`),
  });
}

const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(/,/g, "")));

export const draftToInput = (d: ProductDraft): ProductInput => ({
  code: d.code.trim(),
  name: d.name.trim(),
  collection: d.collection.trim(),
  pattern_name: d.pattern_name.trim(),
  pattern_type: d.pattern_type.trim(),
  colors: splitList(d.colors),
  composition: d.composition.trim(),
  width_cm: toNum(d.width_cm),
  repeat_cm: toNum(d.repeat_cm),
  light_filter: d.light_filter,
  base_price: toNum(d.base_price),
  price_unit: d.price_unit.trim(),
  tags: splitList(d.tags),
  description: d.description.trim(),
  care: d.care.trim(),
});

/** ตรวจเบื้องต้นก่อนส่ง (เซิร์ฟเวอร์ตรวจซ้ำอีกรอบ) */
export function draftErrors(d: ProductDraft): string[] {
  const e: string[] = [];
  if (!d.code.trim()) e.push("รหัสสินค้า");
  if (!d.name.trim()) e.push("ชื่อสินค้า");
  const price = toNum(d.base_price);
  if (price == null || Number.isNaN(price) || price < 0) e.push("ราคา");
  for (const [k, label] of [
    ["width_cm", "หน้ากว้าง"],
    ["repeat_cm", "ระยะซ้ำลาย"],
  ] as const) {
    const n = toNum(d[k]);
    if (n != null && (Number.isNaN(n) || n < 0)) e.push(label);
  }
  return e;
}

// ---------- CSV ----------

const CSV_COLUMNS: [keyof ProductDraft, string][] = [
  ["code", "รหัสสินค้า"],
  ["name", "ชื่อสินค้า"],
  ["collection", "คอลเลคชั่น"],
  ["pattern_name", "ชื่อลาย"],
  ["pattern_type", "ประเภทลาย"],
  ["colors", "สี"],
  ["composition", "ส่วนประกอบ"],
  ["width_cm", "หน้ากว้าง(ซม.)"],
  ["repeat_cm", "ระยะซ้ำลาย(ซม.)"],
  ["light_filter", "การกรองแสง"],
  ["base_price", "ราคา"],
  ["price_unit", "หน่วยราคา"],
  ["tags", "แท็ก"],
  ["description", "รายละเอียด"],
  ["care", "วิธีดูแลรักษา"],
];

export function csvTemplate(): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = CSV_COLUMNS.map(([, th]) => th);
  const example = [
    "BK-1001", "ผ้าม่านทึบแสง Linen Look", "Nordic 2026", "Linen Look", "ลายผ้า/เท็กซ์เจอร์ (Texture)",
    "เทา, ครีม", "Polyester 100%", "280", "0", "ทึบแสง", "450", "หลา", "กันUV, ห้องนอน",
    "เนื้อผ้าหนา ทิ้งตัวสวย", "ซักเครื่องน้ำเย็น",
  ];
  return "﻿" + [header, example].map((r) => r.map(esc).join(",")).join("\r\n");
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function parseLightFilter(s: string): LightFilter | "" {
  const v = s.trim().toLowerCase();
  if (!v) return "";
  if (v in LIGHT_FILTERS) return v as LightFilter;
  if (/ทึบ|black/.test(v)) return "blackout";
  if (/กรอง|dim/.test(v)) return "dimout";
  if (/โปร่ง|sheer/.test(v)) return "sheer";
  return "";
}

const norm = (s: string) => s.replace(/\s|\(.*?\)/g, "").toLowerCase();

/** หัวคอลัมน์รับได้ทั้งภาษาไทย (ตามเทมเพลต) และชื่อฟิลด์อังกฤษ */
export function parseCsv(text: string): ProductDraft[] {
  const [header, ...rows] = parseCsvRows(text.replace(/^﻿/, ""));
  if (!header) return [];
  const index = header.map((h) => {
    const n = norm(h);
    return CSV_COLUMNS.find(([key, th]) => norm(th) === n || key === n)?.[0];
  });
  if (!index.includes("code") && !index.includes("name"))
    throw new Error("ไม่พบคอลัมน์ รหัสสินค้า/ชื่อสินค้า — กรุณาใช้หัวคอลัมน์ตามเทมเพลต");
  return rows.map((r) => {
    const d = newDraft();
    index.forEach((key, i) => {
      const v = (r[i] ?? "").trim();
      if (!key || !v) return;
      if (key === "light_filter") d.light_filter = parseLightFilter(v);
      else if (key === "colors" || key === "tags") d[key] = v.replace(/\|/g, ",");
      else if (key !== "existingImages" && key !== "newImages" && key !== "review") d[key] = v;
    });
    return d;
  });
}
