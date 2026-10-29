// แคตตาล็อก + สินค้า: ตรวจข้อมูล, บันทึก, อัปโหลดไฟล์, สั่งสร้าง embedding

import { HttpError, check } from "@/lib/api";
import { db } from "@/lib/db";
import { removeFiles, uploadFile } from "@/lib/storage";
import { ingestCatalog, reembedProducts } from "@/lib/ai-client";
import { TEST_CATALOG, TEST_PRODUCTS, findTestProduct } from "@/services/test-products";
import type { Catalog, Category, Product } from "@/types/db";
import {
  LIGHT_FILTERS,
  type CatalogInput,
  type CatalogView,
  type LightFilter,
  type ProductDetails,
  type ProductInput,
  type ProductView,
} from "@/types/catalog";

const MAX_IMAGES = 8;
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/;
const CATALOG_FILE_TYPES = /^(application\/pdf|image\/(jpeg|png|webp))$/;

// ---------- แปลง / ตรวจข้อมูล ----------

function str(v: unknown, label: string, max = 200, required = false): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (!s) {
    if (required) throw new HttpError(400, `กรุณากรอก${label}`);
    return null;
  }
  if (s.length > max) throw new HttpError(400, `${label}ยาวเกิน ${max} ตัวอักษร`);
  return s;
}

function num(v: unknown, label: string, required = false): number | null {
  if (v === "" || v == null) {
    if (required) throw new HttpError(400, `กรุณากรอก${label}`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${label}ต้องเป็นตัวเลขไม่ติดลบ`);
  return n;
}

function list(v: unknown, label: string): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new HttpError(400, `${label}ไม่ถูกต้อง`);
  return [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, 30);
}

function parseJson<T>(raw: FormDataEntryValue | null, label: string): T {
  if (typeof raw !== "string") throw new HttpError(400, `ไม่พบข้อมูล${label}`);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, `ข้อมูล${label}ไม่ถูกต้อง`);
  }
}

function imageFiles(form: FormData, field: string): File[] {
  const files = form.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of files)
    if (!IMAGE_TYPES.test(f.type)) throw new HttpError(400, `ไฟล์ ${f.name} ไม่ใช่รูปภาพที่รองรับ`);
  return files;
}

type ProductFields = Pick<Product, "name" | "base_price" | "price_unit"> & {
  description: string | null;
  details: Omit<ProductDetails, "images">;
};

function normalizeProduct(p: Partial<ProductInput>, row?: number): ProductFields {
  const at = row ? ` (แถวที่ ${row})` : "";
  try {
    const light = p.light_filter || null;
    if (light && !(light in LIGHT_FILTERS)) throw new HttpError(400, "ค่าการกรองแสงไม่ถูกต้อง");
    return {
      name: str(p.name, "ชื่อสินค้า", 200, true)!,
      base_price: num(p.base_price, "ราคา", true)!,
      price_unit: str(p.price_unit, "หน่วยราคา", 20) ?? "หลา",
      description: str(p.description, "รายละเอียด", 5000),
      details: {
        code: str(p.code, "รหัสสินค้า", 50, true)!,
        collection: str(p.collection, "คอลเลคชั่น"),
        pattern_name: str(p.pattern_name, "ชื่อลาย"),
        pattern_type: str(p.pattern_type, "ประเภทลาย"),
        colors: list(p.colors, "สี"),
        composition: str(p.composition, "ส่วนประกอบ"),
        width_cm: num(p.width_cm, "หน้ากว้าง"),
        repeat_cm: num(p.repeat_cm, "ระยะซ้ำลาย"),
        light_filter: light as LightFilter | null,
        tags: list(p.tags, "แท็ก"),
        care: str(p.care, "วิธีดูแลรักษา", 1000),
      },
    };
  } catch (e) {
    if (e instanceof HttpError) throw new HttpError(e.status, e.message + at);
    throw e;
  }
}

function normalizeCatalog(c: { [K in keyof CatalogInput]?: unknown }) {
  const category_id = Number(c.category_id);
  if (!Number.isInteger(category_id) || category_id <= 0) throw new HttpError(400, "กรุณาเลือกหมวดหมู่");
  return {
    name: str(c.name, "ชื่อแคตตาล็อก", 200, true)!,
    category_id,
    description: str(c.description, "คำอธิบายแคตตาล็อก", 2000),
    is_visible: c.is_visible !== false,
  };
}

/** กันรหัสสินค้าซ้ำ ทั้งในชุดที่ส่งมาและในฐานข้อมูล */
async function assertCodesUnique(codes: string[], exceptProductId?: number) {
  const seen = new Set<string>();
  for (const c of codes) {
    if (seen.has(c)) throw new HttpError(409, `รหัสสินค้า ${c} ซ้ำกันในรายการ`);
    seen.add(c);
  }
  let q = db().from("product").select("product_id, code:details->>code").in("details->>code", codes);
  if (exceptProductId) q = q.neq("product_id", exceptProductId);
  const dup = check(await q) as { code: string }[];
  if (dup.length) throw new HttpError(409, `รหัสสินค้ามีอยู่แล้วในระบบ: ${dup.map((d) => d.code).join(", ")}`);
}

export function toProductView(p: Product): ProductView {
  const d = (p.details ?? {}) as Partial<ProductDetails>;
  return {
    ...p,
    description: typeof p.description === "string" ? p.description : null,
    details: {
      code: d.code ?? "",
      collection: d.collection ?? null,
      pattern_name: d.pattern_name ?? null,
      pattern_type: d.pattern_type ?? null,
      colors: d.colors ?? [],
      composition: d.composition ?? null,
      width_cm: d.width_cm ?? null,
      repeat_cm: d.repeat_cm ?? null,
      light_filter: d.light_filter ?? null,
      tags: d.tags ?? [],
      care: d.care ?? null,
      images: d.images ?? (p.image_url ? [p.image_url] : []),
    },
  };
}

// ---------- อ่านข้อมูล ----------

export async function listCategories(): Promise<Category[]> {
  return check(await db().from("category").select("*").order("category_id"));
}

export async function listCatalogs(opts: { categoryId?: number; visibleOnly: boolean }): Promise<CatalogView[]> {
  const catalogs = await listDbCatalogs(opts);
  // ชั่วคราวช่วงทดสอบจำลอง: แคตตาล็อกของสินค้าทดสอบ (ฝั่งลูกค้าเท่านั้น)
  if (opts.visibleOnly && (!opts.categoryId || opts.categoryId === TEST_CATALOG.category_id))
    catalogs.push({ ...TEST_CATALOG, category: null, product_count: TEST_PRODUCTS.length });
  return catalogs;
}

async function listDbCatalogs(opts: { categoryId?: number; visibleOnly: boolean }): Promise<CatalogView[]> {
  let q = db().from("catalog").select("*").order("catalog_id", { ascending: false });
  if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts.visibleOnly) q = q.eq("is_visible", true);
  const catalogs: Catalog[] = check(await q);
  if (!catalogs.length) return [];

  const [categories, products] = await Promise.all([
    listCategories(),
    db()
      .from("product")
      .select("catalog_id")
      .in("catalog_id", catalogs.map((c) => c.catalog_id))
      .then((r) => check(r) as { catalog_id: number }[]),
  ]);
  return catalogs.map((c) => ({
    ...c,
    category: categories.find((x) => x.category_id === c.category_id) ?? null,
    product_count: products.filter((p) => p.catalog_id === c.catalog_id).length,
  }));
}

export async function getCatalog(id: number): Promise<Catalog> {
  const c: Catalog | null = check(await db().from("catalog").select("*").eq("catalog_id", id).maybeSingle());
  if (!c) throw new HttpError(404, "ไม่พบแคตตาล็อก");
  return c;
}

export async function listProducts(opts: {
  catalogId?: number;
  categoryId?: number;
  visibleOnly: boolean;
}): Promise<ProductView[]> {
  // ชั่วคราวช่วงทดสอบจำลอง: ต่อท้ายด้วยสินค้าทดสอบที่ไม่อยู่ใน DB (ฝั่งลูกค้าเท่านั้น)
  const test =
    opts.visibleOnly &&
    (!opts.catalogId || opts.catalogId === TEST_CATALOG.catalog_id) &&
    (!opts.categoryId || opts.categoryId === TEST_CATALOG.category_id)
      ? TEST_PRODUCTS
      : [];
  if (opts.catalogId === TEST_CATALOG.catalog_id) return test;
  return [...(await listDbProducts(opts)), ...test];
}

async function listDbProducts(opts: {
  catalogId?: number;
  categoryId?: number;
  visibleOnly: boolean;
}): Promise<ProductView[]> {
  let catalogIds: number[] | undefined;
  if (opts.visibleOnly || opts.categoryId) {
    catalogIds = (await listDbCatalogs({ categoryId: opts.categoryId, visibleOnly: opts.visibleOnly })).map(
      (c) => c.catalog_id,
    );
    if (opts.catalogId) catalogIds = catalogIds.filter((id) => id === opts.catalogId);
    if (!catalogIds.length) return [];
  } else if (opts.catalogId) {
    catalogIds = [opts.catalogId];
  }
  let q = db().from("product").select("*").order("product_id");
  if (catalogIds) q = q.in("catalog_id", catalogIds);
  return (check(await q) as Product[]).map(toProductView);
}

export async function getProduct(id: number, visibleOnly: boolean): Promise<ProductView & { catalog: Catalog }> {
  const test = visibleOnly ? findTestProduct(id) : undefined;
  if (test) return { ...test, catalog: TEST_CATALOG };
  const p: Product | null = check(await db().from("product").select("*").eq("product_id", id).maybeSingle());
  if (!p) throw new HttpError(404, "ไม่พบสินค้า");
  const catalog = await getCatalog(p.catalog_id);
  if (visibleOnly && !catalog.is_visible) throw new HttpError(404, "ไม่พบสินค้า");
  return { ...toProductView(p), catalog };
}

// ---------- เขียนข้อมูล (แอดมิน) ----------

export type AiStatus = "queued" | "skipped" | { error: string };

const aiStatus = (r: { ok: boolean; error?: string }): AiStatus => (r.ok ? "queued" : { error: r.error! });

/**
 * multipart/form-data:
 *  - catalog: JSON CatalogInput
 *  - file: ไฟล์แคตตาล็อก PDF/รูป (ไม่บังคับ)
 *  - products: JSON ProductInput[]
 *  - images_<index>: รูปของสินค้าแถวนั้น (หลายไฟล์ได้)
 */
export async function createCatalog(form: FormData) {
  const catalogIn = normalizeCatalog(parseJson<CatalogInput>(form.get("catalog"), "แคตตาล็อก"));
  const rawProducts = parseJson<ProductInput[]>(form.get("products") ?? "[]", "สินค้า");
  if (!Array.isArray(rawProducts)) throw new HttpError(400, "ข้อมูลสินค้าไม่ถูกต้อง");
  const products = rawProducts.map((p, i) => normalizeProduct(p, i + 1));
  const images = rawProducts.map((_, i) => imageFiles(form, `images_${i}`).slice(0, MAX_IMAGES));

  const file = form.get("file");
  const catalogFile = file instanceof File && file.size > 0 ? file : null;
  if (catalogFile && !CATALOG_FILE_TYPES.test(catalogFile.type))
    throw new HttpError(400, "ไฟล์แคตตาล็อกต้องเป็น PDF หรือรูปภาพ");
  if (!catalogFile && !products.length) throw new HttpError(400, "กรุณาแนบไฟล์แคตตาล็อกหรือเพิ่มสินค้าอย่างน้อย 1 รายการ");
  if (products.length) await assertCodesUnique(products.map((p) => p.details.code));

  const catalog: Catalog = check(await db().from("catalog").insert(catalogIn).select().single());
  const uploaded: string[] = [];
  try {
    if (catalogFile) {
      const file_url = await uploadFile(`catalogs/${catalog.catalog_id}`, catalogFile);
      uploaded.push(file_url);
      check(await db().from("catalog").update({ file_url }).eq("catalog_id", catalog.catalog_id));
      catalog.file_url = file_url;
    }

    const rows = [];
    for (const [i, p] of products.entries()) {
      const urls = [];
      for (const img of images[i]) {
        const url = await uploadFile(`products/${catalog.catalog_id}`, img);
        uploaded.push(url);
        urls.push(url);
      }
      rows.push({
        catalog_id: catalog.catalog_id,
        name: p.name,
        base_price: p.base_price,
        price_unit: p.price_unit,
        description: p.description,
        image_url: urls[0] ?? null,
        details: { ...p.details, images: urls },
      });
    }
    const created: Product[] = rows.length ? check(await db().from("product").insert(rows).select()) : [];

    // สินค้ากรอกเองแล้ว → สร้างแค่ embedding / มีแต่ไฟล์ → ให้ AI อ่านไฟล์สร้างสินค้า
    const ai: AiStatus = created.length
      ? aiStatus(await reembedProducts(created.map((p) => p.product_id)))
      : catalog.file_url
        ? aiStatus(await ingestCatalog(catalog.catalog_id, catalog.file_url))
        : "skipped";

    return { catalog, products: created.map(toProductView), ai };
  } catch (e) {
    // ย้อนกลับ: ลบแคตตาล็อกที่สร้างไปแล้วและไฟล์ที่อัปโหลด
    await db().from("product").delete().eq("catalog_id", catalog.catalog_id);
    await db().from("catalog").delete().eq("catalog_id", catalog.catalog_id);
    await removeFiles(uploaded).catch(() => {});
    throw e;
  }
}

export async function updateCatalog(id: number, body: Partial<CatalogInput>) {
  const current = await getCatalog(id);
  const next = normalizeCatalog({ ...current, ...body });
  const catalog: Catalog = check(await db().from("catalog").update(next).eq("catalog_id", id).select().single());

  // ชื่อ/คำอธิบายแคตตาล็อกมีผลกับข้อความที่ใช้ค้นหา → สร้าง embedding ใหม่
  let ai: AiStatus = "skipped";
  if (next.name !== current.name || next.description !== current.description) {
    const ids = (check(await db().from("product").select("product_id").eq("catalog_id", id)) as Product[]).map(
      (p) => p.product_id,
    );
    if (ids.length) ai = aiStatus(await reembedProducts(ids));
  }
  return { catalog, ai };
}

async function deleteProductsWhere(column: "catalog_id" | "product_id", id: number) {
  const products: Product[] = check(await db().from("product").select("*").eq(column, id));
  const ids = products.map((p) => p.product_id);
  if (ids.length) {
    check(await db().from("vector_embedding").delete().in("product_id", ids));
    check(await db().from("product").delete().in("product_id", ids));
  }
  return products.flatMap((p) => toProductView(p).details.images);
}

export async function deleteCatalog(id: number) {
  const catalog = await getCatalog(id);
  const images = await deleteProductsWhere("catalog_id", id);
  check(await db().from("catalog").delete().eq("catalog_id", id));
  await removeFiles([catalog.file_url, ...images]).catch(() => {});
}

/**
 * multipart/form-data:
 *  - product: JSON ProductInput
 *  - keep_images: JSON string[] รูปเดิมที่เก็บไว้ (ตามลำดับ)
 *  - images: รูปใหม่
 */
export async function updateProduct(id: number, form: FormData) {
  const current = await getProduct(id, false);
  const fields = normalizeProduct(parseJson<ProductInput>(form.get("product"), "สินค้า"));
  if (fields.details.code !== current.details.code) await assertCodesUnique([fields.details.code], id);

  const keep = parseJson<string[]>(form.get("keep_images") ?? "[]", "รูป").filter((u) =>
    current.details.images.includes(u),
  );
  const added = [];
  for (const img of imageFiles(form, "images").slice(0, MAX_IMAGES - keep.length))
    added.push(await uploadFile(`products/${current.catalog_id}`, img));
  const images = [...keep, ...added];

  const product: Product = check(
    await db()
      .from("product")
      .update({ ...fields, image_url: images[0] ?? null, details: { ...fields.details, images } })
      .eq("product_id", id)
      .select()
      .single(),
  );
  await removeFiles(current.details.images.filter((u) => !keep.includes(u))).catch(() => {});
  return { product: toProductView(product), ai: aiStatus(await reembedProducts([id])) };
}

export async function deleteProduct(id: number) {
  await getProduct(id, false);
  const images = await deleteProductsWhere("product_id", id);
  await removeFiles(images).catch(() => {});
}
