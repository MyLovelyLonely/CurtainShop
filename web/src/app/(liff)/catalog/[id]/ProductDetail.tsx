"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import type { Catalog } from "@/types/db";
import { LIGHT_FILTERS, canOptimize, formatPrice, type ProductView } from "@/types/catalog";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<(ProductView & { catalog: Catalog }) | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    api<ProductView & { catalog: Catalog }>(`/api/catalog/products/${id}`)
      .then(setP)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <div className="space-y-4 px-4 py-16 text-center">
        <p className="text-stone-500">{error}</p>
        <Link href="/catalog" className="btn-outline">
          กลับไปหน้าสินค้า
        </Link>
      </div>
    );
  if (!p) return <div className="aspect-square animate-pulse bg-stone-200" />;

  const d = p.details;
  const specs: [string, string | null][] = [
    ["รหัสสินค้า", d.code],
    ["แคตตาล็อก", p.catalog.name],
    ["คอลเลคชั่น", d.collection],
    ["ชื่อลาย", d.pattern_name],
    ["ประเภทลาย", d.pattern_type],
    ["สี", d.colors.join(", ") || null],
    ["ส่วนประกอบ", d.composition],
    ["หน้ากว้าง", d.width_cm != null ? `${d.width_cm} ซม.` : null],
    ["ระยะซ้ำลาย", d.repeat_cm ? `${d.repeat_cm} ซม.` : null],
    ["การกรองแสง", d.light_filter ? LIGHT_FILTERS[d.light_filter] : null],
    ["การดูแลรักษา", d.care],
  ];

  return (
    <div className="flex flex-1 flex-col pb-24">
      <div className="relative aspect-square bg-stone-100">
        {d.images[active] ? (
          <Image src={d.images[active]} alt={p.name} fill priority unoptimized={!canOptimize(d.images[active])} sizes="448px" className="object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-stone-400">ไม่มีรูป</div>
        )}
        <Link
          href="/catalog"
          className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-sm shadow-sm"
          aria-label="กลับ"
        >
          ← กลับ
        </Link>
      </div>
      {d.images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pt-3">
          {d.images.map((src, i) => (
            <button
              key={src}
              onClick={() => setActive(i)}
              className={`relative size-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                i === active ? "border-brand" : "border-transparent"
              }`}
            >
              <Image src={src} alt="" fill unoptimized={!canOptimize(src)} sizes="56px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      <section className="space-y-2 px-4 pt-4">
        <p className="text-xs text-stone-400">{d.code}</p>
        <h1 className="text-xl font-semibold leading-snug">{p.name}</h1>
        <p className="text-2xl font-semibold text-brand">
          ฿{formatPrice(p.base_price)}
          <span className="text-sm font-normal text-stone-500"> / {p.price_unit}</span>
        </p>
        {d.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {d.tags.map((t) => (
              <span key={t} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs text-brand">
                #{t}
              </span>
            ))}
          </div>
        )}
      </section>

      {p.description && (
        <section className="px-4 pt-5">
          <h2 className="mb-1 font-medium">รายละเอียด</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-stone-600">{p.description}</p>
        </section>
      )}

      <section className="px-4 pt-5">
        <h2 className="mb-2 font-medium">ข้อมูลสินค้า</h2>
        <dl className="card divide-y divide-stone-100 text-sm">
          {specs
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex gap-4 px-4 py-2.5">
                <dt className="w-28 shrink-0 text-stone-500">{k}</dt>
                <dd className="flex-1">{v}</dd>
              </div>
            ))}
        </dl>
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-3 px-4 py-3">
          <Link href={`/simulate?productId=${p.product_id}`} className="btn-outline flex-1">
            จำลองในห้องฉัน
          </Link>
          <Link href={`/estimate?productId=${p.product_id}`} className="btn-primary flex-1">
            ประเมินราคา
          </Link>
        </div>
      </div>
    </div>
  );
}
