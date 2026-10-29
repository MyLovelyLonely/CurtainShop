"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import type { CatalogView } from "@/types/catalog";

export default function CatalogsPage() {
  const [catalogs, setCatalogs] = useState<CatalogView[] | null>(null);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () =>
    api<CatalogView[]>("/api/admin/catalogs")
      .then(setCatalogs)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function run(id: number, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  const toggleVisible = (c: CatalogView) =>
    run(c.catalog_id, () =>
      api(`/api/admin/catalogs/${c.catalog_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_visible: !c.is_visible }),
      }),
    );

  const remove = (id: number) => run(id, () => api(`/api/admin/catalogs/${id}`, { method: "DELETE" }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">แคตตาล็อก</h1>
          <p className="text-sm text-stone-500">แคตตาล็อกที่ “แสดง” จะปรากฏในหน้าดูสินค้าของลูกค้า</p>
        </div>
        <Link href="/admin/catalogs/new" className="btn-primary">
          + อัปโหลดแคตตาล็อก
        </Link>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">ชื่อแคตตาล็อก</th>
              <th className="px-4 py-3 font-medium">หมวดหมู่</th>
              <th className="px-4 py-3 text-right font-medium">สินค้า</th>
              <th className="px-4 py-3 font-medium">ไฟล์</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {catalogs === null && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-400">
                  กำลังโหลด…
                </td>
              </tr>
            )}
            {catalogs?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-400">
                  ยังไม่มีแคตตาล็อก
                </td>
              </tr>
            )}
            {catalogs?.map((c) => (
              <tr key={c.catalog_id} className={busyId === c.catalog_id ? "opacity-50" : ""}>
                <td className="px-4 py-3">
                  <Link href={`/admin/catalogs/${c.catalog_id}`} className="font-medium hover:text-brand">
                    {c.name}
                  </Link>
                  {c.description && <p className="line-clamp-1 text-xs text-stone-400">{c.description}</p>}
                </td>
                <td className="px-4 py-3 text-stone-600">{c.category?.name ?? "-"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.product_count}</td>
                <td className="px-4 py-3">
                  {c.file_url ? (
                    <a href={c.file_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      เปิดไฟล์
                    </a>
                  ) : (
                    <span className="text-stone-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleVisible(c)}
                    disabled={busyId !== null}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      c.is_visible ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"
                    }`}
                    title="คลิกเพื่อสลับ"
                  >
                    {c.is_visible ? "แสดง" : "ซ่อน"}
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {confirmId === c.catalog_id ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-red-600">ลบพร้อมสินค้า {c.product_count} รายการ?</span>
                      <button className="btn-danger px-2.5 py-1" onClick={() => remove(c.catalog_id)}>
                        ลบ
                      </button>
                      <button className="btn-outline px-2.5 py-1" onClick={() => setConfirmId(null)}>
                        ยกเลิก
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-2">
                      <Link href={`/admin/catalogs/${c.catalog_id}`} className="btn-outline px-2.5 py-1">
                        แก้ไข
                      </Link>
                      <button
                        className="btn-outline px-2.5 py-1 text-red-600"
                        onClick={() => setConfirmId(c.catalog_id)}
                      >
                        ลบ
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
