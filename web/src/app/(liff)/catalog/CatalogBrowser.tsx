"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoadMore, usePaged } from "@/components/LoadMore";
import { api } from "@/lib/fetcher";
import { shrinkImage } from "@/lib/shrink-image";
import type { Category } from "@/types/db";
import type { SearchResult } from "@/types/search";
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
  // ผลค้นหาจาก AI ผูกกับคำค้น/รูปที่ใช้ค้น (key) — แสดงเฉพาะเมื่อตรงกับคำค้นปัจจุบัน
  const [search, setSearch] = useState<{ key: string; result: SearchResult } | null>(null);
  const [searching, setSearching] = useState(false);
  const [imageQuery, setImageQuery] = useState<{ key: string; preview: string } | null>(null);
  // true = ค้นหาด้วย AI (ความหมาย/รูปภาพ), false = ค้นหาธรรมดา (จับคำที่พิมพ์ กรองในเครื่อง ไม่เรียก ai-server)
  const [aiMode, setAiMode] = useState(true);
  const reqId = useRef(0);

  // ค้นด้วยข้อความ: รอหยุดพิมพ์ 0.4 วิ แล้วให้ AI จัดอันดับ (BGE-M3 + BM25 + RRF)
  useEffect(() => {
    const query = q.trim();
    if (!aiMode || !query || imageQuery) return;
    const id = ++reqId.current;
    const t = setTimeout(() => {
      setSearching(true);
      api<SearchResult>(`/api/catalog/search?q=${encodeURIComponent(query)}`)
        .then((result) => id === reqId.current && setSearch({ key: query, result }))
        .catch((e) => id === reqId.current && setError(e.message))
        .finally(() => id === reqId.current && setSearching(false));
    }, 400);
    return () => clearTimeout(t);
  }, [q, imageQuery, aiMode]);

  async function searchImage(file: File | undefined) {
    if (!file) return;
    const id = ++reqId.current;
    const { blob } = await shrinkImage(file, 1024);
    const key = `image:${id}`;
    if (imageQuery) URL.revokeObjectURL(imageQuery.preview);
    setImageQuery({ key, preview: URL.createObjectURL(blob) });
    setQ("");
    setError("");
    setSearching(true);
    const form = new FormData();
    form.set("image", blob, "query.jpg");
    api<SearchResult>("/api/catalog/search/image", { method: "POST", body: form })
      .then((result) => id === reqId.current && setSearch({ key, result }))
      .catch((e) => id === reqId.current && setError(e.message))
      .finally(() => id === reqId.current && setSearching(false));
  }

  const clearImage = () => {
    if (imageQuery) URL.revokeObjectURL(imageQuery.preview);
    setImageQuery(null);
    setSearch(null);
    reqId.current++;
    setSearching(false);
  };

  const switchMode = (ai: boolean) => {
    if (ai === aiMode) return;
    setAiMode(ai);
    clearImage(); // ยกเลิกผล/คำขอค้นหาด้วย AI ที่ค้างอยู่ (ค้นด้วยรูปใช้ได้เฉพาะโหมด AI)
  };

  const searchKey = imageQuery?.key ?? q.trim();
  const result = aiMode && search && search.key === searchKey ? search.result : null;

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
    const filters = (p: ProductView) => {
      const d = p.details;
      if (catalogId && p.catalog_id !== catalogId) return false;
      if (light && d.light_filter !== light) return false;
      if (patternType && d.pattern_type !== patternType) return false;
      if (color && !d.colors.includes(color)) return false;
      return true;
    };
    // มีผลค้นหาจาก AI → เรียงตามความใกล้เคียง (เฉพาะสินค้าในหมวดที่เลือก) แล้วใช้ตัวกรองอื่นต่อ
    if (result) {
      const inCategory = new Set((products ?? []).map((p) => p.product_id));
      return result.products.filter((p) => inCategory.has(p.product_id) && filters(p));
    }
    if (imageQuery) return [];
    // ค้นหาธรรมดา (และระหว่างรอ AI): กรองจากคำที่พิมพ์
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (products ?? []).filter((p) => {
      const d = p.details;
      if (!filters(p)) return false;
      if (!words.length) return true;
      const hay = [p.name, p.description, d.code, d.collection, d.pattern_name, d.pattern_type, d.composition, d.care, ...d.colors, ...d.tags]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [products, catalogId, light, patternType, color, q, result, imageQuery]);

  const selectCategory = (id: number | null) => {
    if (id === categoryId) return;
    setCategoryId(id);
    setCatalogId(null);
    setProducts(null);
  };

  // แสดงทีละ 24 ชิ้น (สินค้าเป็นพัน การ์ดพร้อมรูปทั้งหมดในครั้งเดียวจะหนักบนมือถือ) เปลี่ยนคำค้น/ตัวกรองแล้วเริ่มใหม่
  const [visible, showMore] = usePaged(JSON.stringify([categoryId, catalogId, light, patternType, color, q, searchKey, aiMode]));

  const filtersOn = !!(catalogId || light || patternType || color || q || imageQuery);
  const clear = () => {
    setCatalogId(null);
    setLight(null);
    setPatternType("");
    setColor("");
    setQ("");
    clearImage();
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 space-y-3 bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <h1 className="text-lg font-semibold">สินค้าทั้งหมด</h1>
        {imageQuery ? (
          <div className="flex items-center gap-3 rounded-full border border-stone-300 bg-white py-1 pl-1 pr-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- รูป blob: ในเครื่อง ไม่ผ่าน next/image */}
            <img src={imageQuery.preview} alt="รูปที่ใช้ค้นหา" className="size-8 rounded-full object-cover" />
            <span className="flex-1 text-sm text-stone-600">ค้นหาลายผ้าที่คล้ายรูปนี้</span>
            <button onClick={clearImage} className="text-sm text-stone-400" aria-label="ยกเลิกค้นหาด้วยรูป">
              ✕
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (!e.target.value.trim()) setSearch(null);
              }}
              placeholder={aiMode ? "ค้นหา เช่น ผ้าม่านสีเทากันแสง, ลายใบไม้, รหัสสินค้า…" : "ค้นหา ชื่อ รหัส สี ลาย…"}
              className={`input rounded-full pl-4 ${aiMode ? "pr-12" : ""}`}
            />
            {aiMode && (
              <label
                className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                title="ค้นหาด้วยรูปภาพ"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" strokeLinejoin="round" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    searchImage(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <div className="inline-flex rounded-full border border-stone-300 bg-white p-0.5">
            {(
              [
                [true, "✨ ค้นหาด้วย AI"],
                [false, "ค้นหาธรรมดา"],
              ] as const
            ).map(([ai, label]) => (
              <button
                key={String(ai)}
                onClick={() => switchMode(ai)}
                aria-pressed={aiMode === ai}
                className={`rounded-full px-3 py-1 transition ${aiMode === ai ? "bg-brand text-white" : "text-stone-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-stone-400">{aiMode ? "เข้าใจความหมาย ค้นด้วยรูปได้" : "หาจากคำที่ตรงกัน ผลทันที"}</span>
        </div>
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
        {result?.notice && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{result.notice}</p>
        )}
        {result?.filters && filterLabels(result.filters).length > 0 && (
          <p className="mb-2 text-xs text-stone-500">AI เข้าใจว่า: {filterLabels(result.filters).join(" · ")}</p>
        )}
        {products && (
          <p className="mb-3 flex items-center justify-between text-sm text-stone-500">
            {searching
              ? "กำลังค้นหา…"
              : `${shown.length} รายการ${result?.mode === "ai" ? " · เรียงตามความใกล้เคียง" : ""}`}
            {filtersOn && (
              <button onClick={clear} className="text-brand">
                ล้างตัวกรอง
              </button>
            )}
          </p>
        )}
        {products && !shown.length && !searching && (
          <p className="py-16 text-center text-sm text-stone-400">
            {q.trim() || imageQuery ? "ไม่พบสินค้าที่ต้องการค้นหา" : "ไม่พบสินค้าที่ตรงกับเงื่อนไข"}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {shown.slice(0, visible).map((p) => (
            <ProductCard key={p.product_id} p={p} match={imageQuery && "via" in p ? matchLabel(p.via as string[]) : null} />
          ))}
        </div>
        <LoadMore remaining={shown.length - visible} onMore={showMore} />
      </main>
    </div>
  );
}

const PATTERN_LABEL: Record<string, string> = {
  plain: "ลายเรียบ",
  texture: "เท็กซ์เจอร์",
  stripe: "ลายทาง",
  floral: "ลายดอก",
  geometric: "ลายเรขาคณิต",
  damask: "ลายดามัสก์",
  botanical: "ลายใบไม้",
  kids: "ลายเด็ก",
};
const LIGHT_LABEL: Record<string, string> = { sheer: "โปร่งแสง", dimout: "กรองแสง", blackout: "ทึบแสง" };

const priceLabel = (p: string) => (p === "cheap" ? "ราคาถูกก่อน" : `ไม่เกิน ${Number(p.slice(4)).toLocaleString()} บาท`);

/** เงื่อนไขที่ ai-server สกัดจากคำค้น → ข้อความสั้น ๆ (ลายครบทุกแบบที่ไม่ใช่ผ้าเรียบ = "มีลาย") */
function filterLabels(f: NonNullable<SearchResult["filters"]>): string[] {
  const patterns = f.patterns.length >= 6 ? ["มีลาย"] : f.patterns.map((p) => PATTERN_LABEL[p] ?? p);
  return [
    ...(f.category?.includes("accessory") ? ["อุปกรณ์ผ้าม่าน"] : []),
    // กลุ่มโทนสี (เช่น สีเข้ม = ดำ เทาเข้ม กรมท่า ...) ยาวเกิน แสดงแค่บางสี
    ...(f.colors.length > 4 ? [`สี${f.colors.slice(0, 3).join("/")} ฯลฯ`] : f.colors.map((c) => `สี${c}`)),
    ...patterns,
    ...f.lights.map((l) => LIGHT_LABEL[l] ?? l),
    ...(f.price ?? []).map(priceLabel),
  ];
}

/** ค้นด้วยรูป: เจอเพราะลายคล้าย หรือแค่โทนสีใกล้เคียง (ai-server ส่ง via มาเป็น pattern / pattern_strong / color) */
const matchLabel = (via: string[]) => (via.some((v) => v.startsWith("pattern")) ? "ลายคล้าย" : "สีใกล้เคียง");

function ProductCard({ p, match }: { p: ProductView; match?: string | null }) {
  // รูปที่โหลดไม่ขึ้น (ลิงก์เสีย) → แสดง "ไม่มีรูป" แทนไอคอนรูปแตก
  const [broken, setBroken] = useState(false);
  return (
    <Link href={`/catalog/${p.product_id}`} className="card overflow-hidden transition active:scale-[0.98]">
      <div className="relative aspect-square bg-stone-100">
        {p.image_url && !broken ? (
          <Image src={p.image_url} alt={p.name} fill unoptimized={!canOptimize(p.image_url)} sizes="(max-width: 448px) 50vw, 224px" className="object-cover" onError={() => setBroken(true)} />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-stone-400">ไม่มีรูป</div>
        )}
        {p.details.light_filter && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-stone-700">
            {LIGHT_FILTERS[p.details.light_filter].split(" (")[0]}
          </span>
        )}
        {match && (
          <span
            className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${
              match === "ลายคล้าย" ? "bg-brand" : "bg-stone-600/80"
            }`}
          >
            {match}
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
