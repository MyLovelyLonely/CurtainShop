"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import type { Catalog } from "@/types/db";
import { CATEGORIES, LIGHT_FILTERS, formatPrice, type ProductView } from "@/types/catalog";
import ProductFields, { ProductDatalists } from "@/components/admin/ProductFields";
import { draftErrors, draftFromProduct, draftToInput, type ProductDraft } from "@/components/admin/product-draft";

type AiStatus = "queued" | "skipped" | { error: string };

const aiNote = (ai: AiStatus) => (typeof ai === "object" ? ` (AI server ยังไม่พร้อม: ${ai.error})` : "");

export default function CatalogEditor() {
  const { id } = useParams<{ id: string }>();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [products, setProducts] = useState<ProductView[]>([]);
  const categories = CATEGORIES;
  const [info, setInfo] = useState({ name: "", category_id: "", description: "", is_visible: true });
  const [editing, setEditing] = useState<{ id: number; draft: ProductDraft } | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // ข้อความจากหน้าอัปโหลด (แสดงครั้งเดียว)
  const [notice, setNotice] = useState(() =>
    typeof window === "undefined" ? "" : (sessionStorage.getItem("catalog-notice") ?? ""),
  );

  const apply = useCallback((data: { catalog: Catalog; products: ProductView[] }) => {
    setCatalog(data.catalog);
    setProducts(data.products);
    setInfo({
      name: data.catalog.name,
      category_id: String(data.catalog.category_id),
      description: data.catalog.description ?? "",
      is_visible: data.catalog.is_visible,
    });
  }, []);
  const fetchCatalog = useCallback(
    () => api<{ catalog: Catalog; products: ProductView[] }>(`/api/admin/catalogs/${id}`),
    [id],
  );
  const load = () => fetchCatalog().then(apply);

  useEffect(() => {
    sessionStorage.removeItem("catalog-notice");
    fetchCatalog()
      .then(apply)
      .catch((e) => setError(e.message));
  }, [fetchCatalog, apply]);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const saveInfo = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await api<{ ai: AiStatus }>(`/api/admin/catalogs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...info, category_id: Number(info.category_id) }),
      });
      await load();
      return "บันทึกข้อมูลแคตตาล็อกแล้ว" + aiNote(res.ai);
    });
  };

  const saveProduct = () =>
    editing &&
    run(async () => {
      if (draftErrors(editing.draft).length) throw new Error(`กรุณากรอก ${draftErrors(editing.draft).join(", ")}`);
      const form = new FormData();
      form.set("product", JSON.stringify(draftToInput(editing.draft)));
      form.set("keep_images", JSON.stringify(editing.draft.existingImages));
      editing.draft.newImages.forEach((f) => form.append("images", f));
      const res = await api<{ ai: AiStatus }>(`/api/admin/products/${editing.id}`, { method: "PATCH", body: form });
      setEditing(null);
      await load();
      return "บันทึกสินค้าแล้ว" + aiNote(res.ai);
    });

  const deleteProduct = (pid: number) =>
    run(async () => {
      await api(`/api/admin/products/${pid}`, { method: "DELETE" });
      setConfirmId(null);
      await load();
      return "ลบสินค้าแล้ว";
    });

  if (!catalog)
    return error ? (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
    ) : (
      <p className="text-stone-400">กำลังโหลด…</p>
    );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/catalogs" className="text-sm text-stone-500 hover:text-brand">
          ← แคตตาล็อกทั้งหมด
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{catalog.name}</h1>
      </div>

      {notice && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={saveInfo} className="card grid gap-4 p-5 sm:grid-cols-2">
        <label>
          <span className="label">ชื่อแคตตาล็อก</span>
          <input className="input" value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
        </label>
        <label>
          <span className="label">หมวดหมู่</span>
          <select
            className="input"
            value={info.category_id}
            onChange={(e) => setInfo({ ...info, category_id: e.target.value })}
          >
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
            value={info.description}
            onChange={(e) => setInfo({ ...info, description: e.target.value })}
          />
        </label>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={info.is_visible}
              onChange={(e) => setInfo({ ...info, is_visible: e.target.checked })}
            />
            แสดงให้ลูกค้าเห็น
          </label>
          {catalog.file_url && (
            <a href={catalog.file_url} target="_blank" rel="noreferrer" className="text-sm text-brand hover:underline">
              เปิดไฟล์แคตตาล็อก
            </a>
          )}
          <button className="btn-primary ml-auto" disabled={busy}>
            บันทึกข้อมูลแคตตาล็อก
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="font-medium">
          สินค้าในแคตตาล็อก <span className="text-stone-400">({products.length})</span>
        </h2>
        {!products.length && (
          <p className="card px-4 py-8 text-center text-sm text-stone-400">
            ยังไม่มีสินค้า{catalog.file_url ? " — ถ้า AI กำลังอ่านไฟล์อยู่ สินค้าจะขึ้นเมื่ออ่านเสร็จ" : ""}
          </p>
        )}
        {products.map((p) =>
          editing?.id === p.product_id ? (
            <div key={p.product_id} className="card space-y-4 border-brand/40 p-4">
              <ProductFields value={editing.draft} onChange={(draft) => setEditing({ id: p.product_id, draft })} showErrors />
              <div className="flex justify-end gap-2">
                <button className="btn-outline" onClick={() => setEditing(null)} disabled={busy}>
                  ยกเลิก
                </button>
                <button className="btn-primary" onClick={saveProduct} disabled={busy}>
                  {busy ? "กำลังบันทึก…" : "บันทึกสินค้า"}
                </button>
              </div>
            </div>
          ) : (
            <div key={p.product_id} className="card flex items-center gap-4 p-3">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                {p.image_url && <Image src={p.image_url} alt="" fill sizes="64px" className="object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  <span className="mr-2 text-brand">{p.details.code}</span>
                  {p.name}
                </p>
                <p className="truncate text-sm text-stone-500">
                  {[
                    p.details.collection,
                    p.details.pattern_name,
                    p.details.colors.join("/"),
                    p.details.light_filter && LIGHT_FILTERS[p.details.light_filter],
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <p className="shrink-0 text-sm tabular-nums">
                ฿{formatPrice(p.base_price)}/{p.price_unit}
              </p>
              {confirmId === p.product_id ? (
                <span className="flex shrink-0 gap-2">
                  <button className="btn-danger px-2.5 py-1" onClick={() => deleteProduct(p.product_id)} disabled={busy}>
                    ยืนยันลบ
                  </button>
                  <button className="btn-outline px-2.5 py-1" onClick={() => setConfirmId(null)}>
                    ยกเลิก
                  </button>
                </span>
              ) : (
                <span className="flex shrink-0 gap-2">
                  <button
                    className="btn-outline px-2.5 py-1"
                    onClick={() => setEditing({ id: p.product_id, draft: draftFromProduct(p) })}
                    disabled={busy || !!editing}
                  >
                    แก้ไข
                  </button>
                  <button className="btn-outline px-2.5 py-1 text-red-600" onClick={() => setConfirmId(p.product_id)}>
                    ลบ
                  </button>
                </span>
              )}
            </div>
          ),
        )}
      </section>
      <ProductDatalists />
    </div>
  );
}
