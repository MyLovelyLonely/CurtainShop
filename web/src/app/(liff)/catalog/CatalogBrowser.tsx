"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/fetcher";
import type { Category } from "@/types/db";
import { LIGHT_FILTERS, canOptimize, formatPrice, type CatalogView, type LightFilter, type ProductView } from "@/types/catalog";

export default function CatalogBrowser() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogView[]>([]);
  const [products, setProducts] = useState<ProductView[] | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [catalogId, setCatalogId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [light, setLight] = useState<LightFilter | null>(null);
  const [patternType, setPatternType] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Category[]>("/api/catalog/categories").then(setCategories).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const qs = categoryId ? `?categoryId=${categoryId}` : "";
    Promise.all([
      api<CatalogView[]>(`/api/catalog/catalogs${qs}`),
      api<ProductView[]>(`/api/catalog/products${qs}`),
    ])
      .then(([c, p]) => {
        setCatalogs(c);
        setProducts(p);
      })
      .catch((e) => setError(e.message));
  }, [categoryId]);

  // ตัวเลือกตัวกรองสร้างจากสินค้าที่มีอยู่จริง
  const options = useMemo(() => {
    const ps = products ?? [];
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
    return {
      patternTypes: uniq(ps.map((p) => p.details.pattern_type)),
      colors: uniq(ps.flatMap((p) => p.details.colors)),
      lights: (Object.keys(LIGHT_FILTERS) as LightFilter[]).filter((l) => ps.some((p) => p.details.light_filter === l)),
    };
  }, [products]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (products ?? []).filter((p) => {
      const d = p.details;
      if (catalogId && p.catalog_id !== catalogId) return false;
      if (light && d.light_filter !== light) return false;
      if (patternType && d.pattern_type !== patternType) return false;
      if (color && !d.colors.includes(color)) return false;
      if (!words.length) return true;
      const hay = [p.name, d.code, d.collection, d.pattern_name, d.pattern_type, d.composition, ...d.colors, ...d.tags]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [products, catalogId, light, patternType, color, q]);

  const selectCategory = (id: number | null) => {
    if (id === categoryId) return;
    setCategoryId(id);
    setCatalogId(null);
    setProducts(null);
  };

  const filtersOn = !!(catalogId || light || patternType || color || q);
  const clear = () => {
    setCatalogId(null);
    setLight(null);
    setPatternType("");
    setColor("");
    setQ("");
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 space-y-3 bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <h1 className="text-lg font-semibold">สินค้าทั้งหมด</h1>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา ชื่อ รหัส สี ลาย…"
          className="input rounded-full px-4"
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip active={categoryId === null} onClick={() => selectCategory(null)}>
            ทั้งหมด
          </Chip>
          {categories.map((c) => (
            <Chip
              key={c.category_id}
              active={categoryId === c.category_id}
              onClick={() => selectCategory(c.category_id)}
            >
              {c.name}
            </Chip>
          ))}
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3 text-sm">
        <Select value={catalogId ?? ""} onChange={(v) => setCatalogId(v ? Number(v) : null)} label="ทุกแคตตาล็อก">
          {catalogs.map((c) => (
            <option key={c.catalog_id} value={c.catalog_id}>
              {c.name}
            </option>
          ))}
        </Select>
        {options.lights.length > 0 && (
          <Select value={light ?? ""} onChange={(v) => setLight((v || null) as LightFilter | null)} label="การกรองแสง">
            {options.lights.map((l) => (
              <option key={l} value={l}>
                {LIGHT_FILTERS[l]}
              </option>
            ))}
          </Select>
        )}
        {options.patternTypes.length > 0 && (
          <Select value={patternType} onChange={setPatternType} label="ประเภทลาย">
            {options.patternTypes.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        )}
        {options.colors.length > 0 && (
          <Select value={color} onChange={setColor} label="สี">
            {options.colors.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        )}
      </div>

      <main className="flex-1 px-4 pb-8">
        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {products === null && !error && <SkeletonGrid />}
        {products && (
          <p className="mb-3 flex items-center justify-between text-sm text-stone-500">
            {shown.length} รายการ
            {filtersOn && (
              <button onClick={clear} className="text-brand">
                ล้างตัวกรอง
              </button>
            )}
          </p>
        )}
        {products && !shown.length && (
          <p className="py-16 text-center text-sm text-stone-400">ไม่พบสินค้าที่ตรงกับเงื่อนไข</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {shown.map((p) => (
            <ProductCard key={p.product_id} p={p} />
          ))}
        </div>
      </main>
    </div>
  );
}

function ProductCard({ p }: { p: ProductView }) {
  return (
    <Link href={`/catalog/${p.product_id}`} className="card overflow-hidden transition active:scale-[0.98]">
      <div className="relative aspect-square bg-stone-100">
        {p.image_url ? (
          <Image src={p.image_url} alt={p.name} fill unoptimized={!canOptimize(p.image_url)} sizes="(max-width: 448px) 50vw, 224px" className="object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-stone-400">ไม่มีรูป</div>
        )}
        {p.details.light_filter && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-stone-700">
            {LIGHT_FILTERS[p.details.light_filter].split(" (")[0]}
          </span>
        )}
      </div>
      <div className="space-y-0.5 p-2.5">
        <p className="text-[11px] text-stone-400">{p.details.code}</p>
        <p className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</p>
        <p className="pt-1 text-sm font-semibold text-brand">
          ฿{formatPrice(p.base_price)}
          <span className="text-xs font-normal text-stone-500"> / {p.price_unit}</span>
        </p>
      </div>
    </Link>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
        active ? "bg-brand text-white" : "border border-stone-300 bg-white text-stone-600"
      }`}
    >
      {children}
    </button>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string | number;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`shrink-0 rounded-lg border px-2.5 py-1.5 ${
        value ? "border-brand bg-brand-soft text-brand" : "border-stone-300 bg-white text-stone-600"
      }`}
    >
      <option value="">{label}</option>
      {children}
    </select>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="aspect-square animate-pulse bg-stone-200" />
          <div className="space-y-2 p-2.5">
            <div className="h-3 w-1/3 animate-pulse rounded bg-stone-200" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-stone-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
