"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fetcher";
import { CATEGORIES } from "@/types/catalog";
import ProductFields, { ProductDatalists } from "@/components/admin/ProductFields";
import {
  csvTemplate,
  draftErrors,
  draftFromExtracted,
  draftKey,
  draftToInput,
  type ExtractedProduct,
  newDraft,
  parseCsv,
  type ProductDraft,
} from "@/components/admin/product-draft";

type CreateResult = { catalog: { catalog_id: number }; products: unknown[]; ai: "queued" | "skipped" | { error: string } };

export default function NewCatalogPage() {
  const router = useRouter();
  const categories = CATEGORIES;
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(String(CATEGORIES[0].category_id));
  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [products, setProducts] = useState<ProductDraft[]>(() => [newDraft()]);
  const [openKey, setOpenKey] = useState<string | null>(() => products[0]?.key ?? null);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const [extracting, setExtracting] = useState(false);

  async function extractWithAi() {
    if (!file) return;
    setError("");
    setNotice("");
    setExtracting(true);
    try {
      const res = await api<{ count: number; products: ExtractedProduct[] }>("/api/admin/catalogs/extract", {
        method: "POST",
        body: (() => {
          const f = new FormData();
          f.set("file", file);
          return f;
        })(),
      });
      if (!res.count) throw new Error("AI ไม่พบสินค้าในไฟล์นี้");
      const drafts = await Promise.all(res.products.map(draftFromExtracted));
      setProducts((ps) => [...ps.filter((p) => filled.includes(p)), ...drafts]);
      setOpenKey(drafts.find((d) => d.review?.length)?.key ?? null);
      const flagged = drafts.filter((d) => d.review?.length).length;
      setNotice(
        `AI อ่านได้ ${res.count} รายการ${flagged ? ` (ควรตรวจ ${flagged} รายการ — ดูป้ายสีเหลือง)` : ""} — ตรวจและแก้ไขก่อนบันทึก`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  // แถวที่ยังว่างทั้งแถวไม่นับเป็นสินค้า
  const filled = products.filter((p) =>
    [p.code, p.name, p.base_price, p.collection, p.pattern_name].some((v) => v.trim()) || p.newImages.length,
  );
  const invalidRows = filled.map((p) => ({ p, errors: draftErrors(p) })).filter((x) => x.errors.length);

  const update = (key: string, next: ProductDraft) =>
    setProducts((ps) => ps.map((p) => (p.key === key ? next : p)));

  function addProduct(from?: ProductDraft) {
    // "คัดลอก" ช่วยกรอกสินค้าลายเดียวกันหลายสี: เก็บข้อมูลไว้ ล้างรหัส/สี/รูป
    const d = from
      ? newDraft({ ...from, key: draftKey(), code: "", colors: "", newImages: [], existingImages: [] })
      : newDraft({ collection: products.at(-1)?.collection ?? "", price_unit: products.at(-1)?.price_unit ?? "หลา" });
    setProducts((ps) => [...ps, d]);
    setOpenKey(d.key);
  }

  async function importCsv(f: File) {
    setError("");
    try {
      const rows = parseCsv(await f.text());
      if (!rows.length) throw new Error("ไม่พบข้อมูลในไฟล์");
      setProducts((ps) => [...ps.filter((p) => filled.includes(p)), ...rows]);
      setOpenKey(null);
      setNotice(`นำเข้า ${rows.length} รายการจาก ${f.name} — เพิ่มรูปสินค้าได้โดยกดเปิดแต่ละรายการ`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([csvTemplate()], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "product-template.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setShowErrors(true);
    if (!name.trim() || !categoryId) return setError("กรุณากรอกชื่อแคตตาล็อกและเลือกหมวดหมู่");
    if (!file && !filled.length) return setError("กรุณาแนบไฟล์แคตตาล็อกหรือเพิ่มสินค้าอย่างน้อย 1 รายการ");
    if (invalidRows.length) {
      setOpenKey(invalidRows[0].p.key);
      return setError(`ข้อมูลสินค้ายังไม่ครบ ${invalidRows.length} รายการ`);
    }

    const form = new FormData();
    form.set(
      "catalog",
      JSON.stringify({ name, category_id: Number(categoryId), description, is_visible: visible }),
    );
    if (file) form.set("file", file);
    form.set("products", JSON.stringify(filled.map(draftToInput)));
    filled.forEach((p, i) => p.newImages.forEach((img) => form.append(`images_${i}`, img)));

    setSaving(true);
    try {
      const res = await api<CreateResult>("/api/admin/catalogs", { method: "POST", body: form });
      const ai =
        res.ai === "queued"
          ? "ส่งให้ AI สร้างข้อมูลค้นหาแล้ว"
          : res.ai === "skipped"
            ? ""
            : `แต่ AI server ยังไม่พร้อม (${res.ai.error}) — สินค้าจะยังค้นหาด้วยรูป/ความหมายไม่ได้`;
      sessionStorage.setItem("catalog-notice", `บันทึกแคตตาล็อกและสินค้า ${res.products.length} รายการแล้ว ${ai}`);
      router.push(`/admin/catalogs/${res.catalog.catalog_id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-24">
      <div>
        <Link href="/admin/catalogs" className="text-sm text-stone-500 hover:text-brand">
          ← แคตตาล็อกทั้งหมด
        </Link>
        <h1 className="mt-1 text-xl font-semibold">อัปโหลดแคตตาล็อก</h1>
      </div>

      <section className="card space-y-4 p-5">
        <h2 className="font-medium">ข้อมูลแคตตาล็อก</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="label">ชื่อแคตตาล็อก *</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span className="label">หมวดหมู่ *</span>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— เลือกหมวดหมู่ —</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="label">คำอธิบาย</span>
            <textarea
              className="input min-h-16"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            <span className="label">ไฟล์แคตตาล็อก (PDF / รูป)</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="input file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-brand"
            />
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-outline px-3 py-1.5"
                onClick={extractWithAi}
                disabled={!file || extracting}
              >
                {extracting ? "AI กำลังอ่าน…" : "อ่านด้วย AI (ทดสอบ OCR)"}
              </button>
              <span className="text-xs text-stone-500">
                {extracting
                  ? "ประมาณ 10–15 วินาทีต่อหน้า — ต้องเปิด Ollama และ ai-server ไว้"
                  : "เติมรายการสินค้าลงฟอร์มให้ตรวจก่อน ยังไม่บันทึก"}
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2 self-center text-sm">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
              className="size-4 accent-brand"
            />
            แสดงให้ลูกค้าเห็นทันที
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            สินค้า <span className="text-stone-400">({filled.length})</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline" onClick={downloadTemplate}>
              ดาวน์โหลดเทมเพลต CSV
            </button>
            <label className="btn-outline cursor-pointer">
              นำเข้า CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCsv(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" className="btn-outline" onClick={() => addProduct()}>
              + เพิ่มสินค้า
            </button>
          </div>
        </div>

        {notice && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

        {products.map((p, i) => {
          const open = openKey === p.key;
          const errors = showErrors && filled.includes(p) ? draftErrors(p) : [];
          return (
            <div key={p.key} className={`card ${errors.length ? "border-red-300" : ""}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : p.key)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="text-stone-400">{open ? "▾" : "▸"}</span>
                  <span className="w-8 shrink-0 text-sm text-stone-400">#{i + 1}</span>
                  <span className="truncate font-medium">
                    {p.code && <span className="mr-2 text-brand">{p.code}</span>}
                    {p.name || <span className="font-normal text-stone-400">สินค้าใหม่</span>}
                  </span>
                  {p.base_price && (
                    <span className="ml-auto shrink-0 text-sm text-stone-500">
                      ฿{p.base_price}/{p.price_unit}
                    </span>
                  )}
                  {errors.length > 0 && (
                    <span className="shrink-0 text-xs text-red-600">ขาด: {errors.join(", ")}</span>
                  )}
                  {!errors.length && !!p.review?.length && (
                    <span
                      className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                      title={p.review.join("\n")}
                    >
                      AI: ควรตรวจ
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="text-sm text-stone-500 hover:text-brand"
                  onClick={() => addProduct(p)}
                  title="คัดลอกเป็นสินค้าใหม่ (เช่น ลายเดียวกันสีอื่น)"
                >
                  คัดลอก
                </button>
                <button
                  type="button"
                  className="text-sm text-stone-500 hover:text-red-600"
                  onClick={() => setProducts((ps) => ps.filter((x) => x.key !== p.key))}
                >
                  ลบ
                </button>
              </div>
              {open && (
                <div className="border-t border-stone-100 p-4">
                  <ProductFields value={p} onChange={(next) => update(p.key, next)} showErrors={showErrors} />
                </div>
              )}
            </div>
          );
        })}
        {!products.length && (
          <p className="card px-4 py-8 text-center text-sm text-stone-400">
            ยังไม่มีสินค้า — กด “เพิ่มสินค้า” หรือ “นำเข้า CSV”
          </p>
        )}
      </section>

      <ProductDatalists />

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 py-3">
          {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
          <Link href="/admin/catalogs" className="btn-outline">
            ยกเลิก
          </Link>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "กำลังอัปโหลด…" : `บันทึกแคตตาล็อก${filled.length ? ` + สินค้า ${filled.length} รายการ` : ""}`}
          </button>
        </div>
      </div>
    </form>
  );
}
