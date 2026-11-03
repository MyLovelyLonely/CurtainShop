"use client";
// หน้าแคตตาล็อกลายผ้า (Use Case 2–3) ค้นหา / กรองลายผ้า มีทางลัดไปหน้าสรุปราคา
//   ดึงสินค้าจริงจาก GET /api/liff/catalog แล้วค้นหา / กรอง / เรียงในเครื่อง
// ยังไม่เสร็จ:
//   - ค้นหาด้วยรูป (ปุ่มกล้อง) ยังแค่แสดงรูปที่เลือก ไม่ได้ค้นจริง
//   - ยังไม่มีวันที่เพิ่มสินค้า "ล่าสุด / เก่าสุด" เลยเรียงตาม product_id แทน
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ArrowLeft, Camera, Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { useApi } from "@/components/liff/LiffProvider";

// สินค้าจริงจาก GET /api/liff/catalog (เฉพาะแคตตาล็อกที่เปิดให้ลูกค้าเห็น)
type Fabric = {
  product_id: number; name: string; base_price: number; price_unit: string; image_url: string | null; category: string; catalog: string;
  code: string | null; light_filter: Light | null; pattern_type: string | null; colors: string[]; tags: string[];
  orders: number; // ถูกใส่ในใบประเมิน/ใบเสนอราคากี่ครั้ง > 0 = ยอดนิยม
};

const LIGHT_LABEL = { sheer: "โปร่งแสง", dimout: "กรองแสง", blackout: "ทึบแสง" } as const;
type Light = keyof typeof LIGHT_LABEL;

const PRICE_SORTS = { asc: "ต่ำ–สูง", desc: "สูง–ต่ำ" } as const;
type PriceSort = keyof typeof PRICE_SORTS | "";

const num = (s: string) => (s.trim() === "" ? null : Number(s));
const money = (n: number) => `฿${n.toLocaleString("th-TH")}`;
const unique = (list: string[]) => [...new Set(list)];
const CHIP = "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors";
const chipTone = (on: boolean) => (on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-800 active:bg-stone-100");

type Panel = "category" | "catalog" | "price";

// หัวข้อหน้าตามหมวดที่เลือก (ชื่อหมวดมาจากตาราง category) หมวดใหม่ที่ไม่อยู่ในนี้ = "แคตตาล็อก" + ชื่อหมวด
const CATEGORY_TITLE: Record<string, string> = { "": "แคตตาล็อก", "ผ้าม่าน": "แคตตาล็อกลายผ้า", "อุปกรณ์ผ้าม่าน": "แคตตาล็อกอุปกรณ์" };
const categoryTitle = (c: string) => CATEGORY_TITLE[c] ?? `แคตตาล็อก${c}`;
const OPTION = "rounded-xl border py-2 text-sm font-medium";

// ชิปที่กดแล้วเปิดแผงตัวเลือกใต้แถวชิป (หมวด / แคตตาล็อก / ราคา ใช้หน้าตาเดียวกัน)
function DropChip({ label, on, open, onClick }: { label: string; on: boolean; open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className={`${CHIP} ${chipTone(on)} flex items-center gap-1`}>
      {label}
      <ChevronDown size={16} strokeWidth={2.5} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

function DropPanel({ children, onClear, onDone }: { children: React.ReactNode; onClear: () => void; onDone: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      {children}
      <div className="flex gap-2">
        <button type="button" onClick={onClear} className="flex-1 rounded-xl border border-stone-300 py-2 text-sm font-medium text-stone-700">ล้าง</button>
        <button type="button" onClick={onDone} className="flex-1 rounded-xl bg-stone-900 py-2 text-sm font-semibold text-white">เสร็จ</button>
      </div>
    </div>
  );
}

// ชื่อบนชิปตัวเลือกหลายค่า: ยังไม่เลือก = ชื่อกลุ่ม / เลือก 1 = ชื่อนั้น / หลายตัว = ชื่อกลุ่ม (จำนวน)
const multiLabel = (title: string, picked: string[]) =>
  picked.length === 0 ? title : picked.length === 1 ? picked[0] : `${title} (${picked.length})`;

// ตัวเลือกแบบเลือกได้หลายค่า กดซ้ำ = เอาออก
function OptionGrid({ title, options, value, onChange }: { title: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const all = value.length === options.length;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold text-stone-500">{title} <span className="font-normal">(เลือกได้หลายรายการ)</span></p>
        <button type="button" onClick={() => onChange(all ? [] : options)} className="text-xs font-semibold text-stone-900 underline">
          {all ? "ไม่เลือกทั้งหมด" : "เลือกทั้งหมด"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button key={o} type="button" onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])} aria-pressed={on}
              className={`${OPTION} ${chipTone(on)} flex items-center justify-center gap-1.5`}>
              {on && <Check size={14} strokeWidth={3} aria-hidden="true" />}{o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PriceInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <input type="number" inputMode="numeric" min={0} step={100} placeholder={label} aria-label={`ราคา${label}`}
      value={value} onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900" />
  );
}

function FabricCard({ fabric }: { fabric: Fabric }) {
  // รูปที่โหลดไม่ขึ้น (ลิงก์เสีย) -> แสดง "ไม่มีรูป" แทนไอคอนรูปแตก
  const [broken, setBroken] = useState(false);
  return (
    <Link href={`/liff/catalog/${fabric.product_id}`} className="block overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition active:scale-[0.98]">
      <div className="relative aspect-square bg-stone-100">
        {fabric.image_url && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- รูปจาก R2 / ลิงก์ภายนอก ยังไม่ได้ตั้ง next/image remotePatterns
          <img src={fabric.image_url} alt={fabric.name} loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-stone-400">ไม่มีรูป</div>
        )}
        {fabric.light_filter && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-stone-700">{LIGHT_LABEL[fabric.light_filter]}</span>
        )}
      </div>
      <div className="space-y-0.5 p-2.5">
        {fabric.code && <p className="text-[11px] text-stone-400">{fabric.code}</p>}
        <p className="line-clamp-2 text-sm font-medium leading-snug">{fabric.name}</p>
        <p className="pt-1 text-sm font-semibold tabular-nums text-primary">
          {money(fabric.base_price)}
          <span className="text-xs font-normal text-stone-500"> / {fabric.price_unit}</span>
        </p>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
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

export default function LiffCatalog() {
  const api = useApi();
  const [products, setProducts] = useState<Fabric[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [popular, setPopular] = useState(false);
  const [category, setCategory] = useState(""); // ว่าง = ทุกหมวด
  const [catalog, setCatalog] = useState<string[]>([]);
  const [priceSort, setPriceSort] = useState<PriceSort>("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [open, setOpen] = useState<Panel | null>(null); // แผงตัวเลือกที่เปิดอยู่ (อยู่นอกแถวชิป เพราะแถวชิปตัดส่วนที่ล้นทิ้ง)
  const [newest, setNewest] = useState(true); // ล่าสุด <-> เก่าสุด
  const [photo, setPhoto] = useState<string | null>(null); // blob: URL ของรูปที่ใช้ค้นหา
  const fileRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [edge, setEdge] = useState({ start: false, end: false }); // ยังเลื่อนไปทางซ้าย / ขวาได้อีกไหม

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  useEffect(() => {
    api<{ products: Fabric[] }>("/api/liff/catalog").then(
      (d) => setProducts(d.products),
      (e: Error) => setLoadError(e.message),
    );
  }, [api]);

  // แถวชิปเลื่อนแนวนอน: มือถือปัดนิ้วได้เอง คอม = หมุนล้อเมาส์ / ลากเมาส์ แล้วโชว์เงาจางตรงขอบที่ยังเลื่อนต่อได้
  const updateEdge = () => {
    const el = chipsRef.current;
    if (el) setEdge({ start: el.scrollLeft > 2, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    updateEdge();
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault(); // React ใส่ wheel แบบ passive จึงต้อง addEventListener เอง
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", updateEdge);
    return () => { el.removeEventListener("wheel", onWheel); window.removeEventListener("resize", updateEdge); };
  }, [showFilters]);

  const chipsHandlers = {
    onScroll: updateEdge,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") drag.current = { x: e.clientX, left: chipsRef.current!.scrollLeft, moved: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (Math.abs(e.clientX - d.x) > 4) d.moved = true;
      if (d.moved) chipsRef.current!.scrollLeft = d.left - (e.clientX - d.x);
    },
    onPointerUp: () => { setTimeout(() => { drag.current = null; }); },
    onPointerLeave: () => { if (drag.current && !drag.current.moved) drag.current = null; },
    // ลากเสร็จแล้วไม่ให้นับเป็นการกดชิป
    onClickCapture: (e: React.MouseEvent) => { if (drag.current?.moved) { e.preventDefault(); e.stopPropagation(); } },
  };

  const categories = useMemo(() => unique((products ?? []).map((f) => f.category)), [products]);
  // แคตตาล็อกให้เลือกเฉพาะของหมวดที่เลือกอยู่
  const catalogs = useMemo(() => unique((products ?? []).filter((f) => !category || f.category === category).map((f) => f.catalog)), [products, category]);
  // เปลี่ยนหมวด = ตัดแคตตาล็อกที่เลือกไว้แต่ไม่อยู่ในหมวดใหม่ออก
  const pickCategory = (c: string) => {
    setCategory(c);
    if (c) setCatalog((prev) => prev.filter((name) => (products ?? []).some((f) => f.catalog === name && f.category === c)));
  };
  // ช่วงราคาที่กรอก ใส่ต่ำ/สูงสลับกันมาก็ใช้ได้
  const [lo, hi] = (() => {
    const a = num(minPrice), b = num(maxPrice);
    return a !== null && b !== null && a > b ? [b, a] : [a, b];
  })();
  const priceLabel = [
    priceSort && PRICE_SORTS[priceSort],
    lo !== null && hi !== null ? `${money(lo)}–${money(hi)}` : lo !== null ? `${money(lo)} ขึ้นไป` : hi !== null ? `ไม่เกิน ${money(hi)}` : "",
  ].filter(Boolean).join(" · ") || "ราคา";
  const priceOn = priceSort !== "" || lo !== null || hi !== null;

  const fabrics = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (products ?? []).filter((f) =>
      (!q || [f.code ?? "", f.name, f.catalog, f.pattern_type ?? "", f.light_filter ? LIGHT_LABEL[f.light_filter] : "", ...f.colors, ...f.tags]
        .some((s) => s.toLowerCase().includes(q)))
      && (!category || f.category === category) && (!popular || f.orders > 0) && (!catalog.length || catalog.includes(f.catalog))
      && (lo === null || f.base_price >= lo) && (hi === null || f.base_price <= hi));
    // เรียงตามราคาก่อน (ถ้าเลือก) ราคาเท่ากันค่อยเรียงตามวันที่ (ยังไม่มีวันที่ ใช้ product_id แทน) / ยอดนิยม = ขายบ่อยก่อน
    const byDate = (a: Fabric, b: Fabric) => (newest ? b.product_id - a.product_id : a.product_id - b.product_id);
    return list.sort((a, b) =>
      (priceSort === "asc" ? a.base_price - b.base_price : priceSort === "desc" ? b.base_price - a.base_price : 0)
      || (popular ? b.orders - a.orders : 0) || byDate(a, b));
  }, [products, query, category, popular, catalog, lo, hi, priceSort, newest]);

  const clearPrice = () => { setPriceSort(""); setMinPrice(""); setMaxPrice(""); };
  const resetFilters = () => { setCategory(""); setPopular(false); setCatalog([]); clearPrice(); setOpen(null); };
  const toggleOpen = (p: Panel) => setOpen((v) => (v === p ? null : p));

  // ออกจากหน้าเว็บ: ในแอป LINE = ปิดหน้า LIFF กลับห้องแชท / เบราว์เซอร์ธรรมดา = ปิดแท็บ
  // (เบราว์เซอร์ยอมให้ window.close() เฉพาะแท็บที่เปิดด้วยสคริปต์หรือลิงก์จาก LINE ถ้าปิดไม่ได้จะไม่เกิดอะไร)
  const backToChat = () => {
    import("@line/liff").then(({ default: liff }) => {
      if (liff.isInClient()) liff.closeWindow(); else window.close();
    }).catch(() => window.close());
  };

  return (
    <div className="relative -mx-4 -mt-4 px-4 pt-4">
      {/* แสงฟุ้งหลังหัวหน้า */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-6 h-56 bg-[radial-gradient(ellipse_45%_60%_at_50%_40%,rgba(226,190,240,.55),rgba(214,240,200,.35)_55%,transparent_75%)] blur-xl" />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between">
          <button type="button" onClick={backToChat} className="-ml-1 flex items-center gap-2 rounded-lg p-1 text-stone-900">
            <ArrowLeft size={22} className="text-stone-600" />
            <span className="text-base font-bold">หน้าแชท</span>
          </button>
          <Link href="/liff/estimate" aria-label="ใบสรุปราคา" title="ใบสรุปราคา"
            className="relative rounded-lg p-1.5 text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">
            {/* รถเข็นมีตาข่าย (วาดเอง lucide ไม่มีแบบนี้) */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1c1410" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 3h2.5l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h9.6a1.5 1.5 0 0 0 1.5-1.2L21 6H5.1" />
              <path d="M9.6 6l.5 9.4M13.6 6v9.4M17.6 6l-.5 9.4M5.9 10.5h14.2" strokeWidth="1" />
              <circle cx="8.5" cy="20" r="1.3" />
              <circle cx="17.5" cy="20" r="1.3" />
            </svg>
          </Link>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white/90 px-3 py-2.5 shadow-sm backdrop-blur focus-within:border-stone-400">
          <Search size={16} className="shrink-0 text-stone-500" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" enterKeyHint="search"
            placeholder="พิมพ์คำค้นหา หรืออธิบายแบบที่ต้องการ..." aria-label="ค้นหาลายผ้า"
            className="min-w-0 flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400" />
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="ค้นหาด้วยรูป" className="p-0.5 text-stone-500">
            <Camera size={18} />
          </button>
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-label="ตัวกรอง" aria-pressed={showFilters}
            className={`p-0.5 ${showFilters ? "text-stone-900" : "text-stone-500"}`}>
            <SlidersHorizontal size={18} className="rotate-90" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto(URL.createObjectURL(f)); e.target.value = ""; }} />
        </div>

        {photo && (
          <div className="flex items-center gap-3 rounded-2xl border border-stone-300 bg-white py-1 pl-1 pr-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- รูป blob: ในเครื่อง ไม่ผ่าน next/image */}
            <img src={photo} alt="" className="size-9 rounded-xl object-cover" />
            <span className="flex-1 text-sm text-stone-600">ค้นหาลายผ้าที่คล้ายรูปนี้</span>
            <button type="button" onClick={() => setPhoto(null)} className="text-stone-400" aria-label="ยกเลิกค้นหาด้วยรูป">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 pt-6">
          <div>
            <h1 className="text-xl font-bold text-stone-900">{categoryTitle(category)}</h1>
            <p className="mt-0.5 text-xs text-stone-500">เลือกดูรายละเอียดและจำลองลายผ้าได้เลยค่ะ :)</p>
          </div>
          <span className="shrink-0 rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5 text-sm text-stone-700">{products === null ? "…" : fabrics.length} รายการ</span>
        </div>

        {showFilters && (
          <div className="relative -mx-4">
          <div ref={chipsRef} {...chipsHandlers}
            className="flex cursor-grab touch-pan-x select-none gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <DropChip label={category || "ทั้งหมด"} on open={open === "category"} onClick={() => toggleOpen("category")} />
            <button type="button" onClick={() => setPopular((v) => !v)} className={`${CHIP} ${chipTone(popular)}`}>ยอดนิยม</button>
            <DropChip label={multiLabel("แคตตาล็อก", catalog)} on={catalog.length > 0} open={open === "catalog"} onClick={() => toggleOpen("catalog")} />
            <DropChip label={priceLabel} on={priceOn} open={open === "price"} onClick={() => toggleOpen("price")} />
            <button type="button" onClick={() => setNewest((v) => !v)} aria-label={`เรียงตาม${newest ? "ล่าสุด" : "เก่าสุด"} (กดเพื่อสลับ)`}
              className={`${CHIP} ${chipTone(false)} flex items-center gap-1`}>
              {newest ? "ล่าสุด" : "เก่าสุด"}
              <ArrowDownUp size={15} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>
          <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent transition-opacity ${edge.start ? "opacity-100" : "opacity-0"}`} />
          <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent transition-opacity ${edge.end ? "opacity-100" : "opacity-0"}`} />
          </div>
        )}

        {showFilters && open === "category" && (
          <DropPanel onClear={() => pickCategory("")} onDone={() => setOpen(null)}>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-500">หมวดสินค้า</p>
              <div className="grid grid-cols-2 gap-2">
                {["", ...categories].map((c) => (
                  <button key={c || "all"} type="button" onClick={() => pickCategory(c)} aria-pressed={category === c}
                    className={`${OPTION} ${chipTone(category === c)}`}>
                    {c || "ทั้งหมด"}
                    <span className="ml-1 text-xs opacity-60">{(products ?? []).filter((f) => !c || f.category === c).length}</span>
                  </button>
                ))}
              </div>
            </div>
          </DropPanel>
        )}
        {showFilters && open === "catalog" && (
          <DropPanel onClear={() => setCatalog([])} onDone={() => setOpen(null)}>
            <OptionGrid title="แคตตาล็อก" options={catalogs} value={catalog} onChange={setCatalog} />
          </DropPanel>
        )}
        {showFilters && open === "price" && (
          <DropPanel onClear={clearPrice} onDone={() => setOpen(null)}>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-500">เรียงตามราคา</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PRICE_SORTS) as (keyof typeof PRICE_SORTS)[]).map((k) => (
                  <button key={k} type="button" onClick={() => setPriceSort((v) => (v === k ? "" : k))} aria-pressed={priceSort === k}
                    className={`${OPTION} ${chipTone(priceSort === k)}`}>
                    ราคา{PRICE_SORTS[k]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-500">ช่วงราคา (บาท)</p>
              <div className="flex items-center gap-2">
                <PriceInput label="ต่ำสุด" value={minPrice} onChange={setMinPrice} />
                <span className="text-stone-400">–</span>
                <PriceInput label="สูงสุด" value={maxPrice} onChange={setMaxPrice} />
              </div>
            </div>
          </DropPanel>
        )}

        {loadError ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
        ) : products === null ? (
          <SkeletonGrid />
        ) : fabrics.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {fabrics.map((f) => <FabricCard key={f.product_id} fabric={f} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-12 text-center text-sm text-stone-500">
            ไม่พบลายผ้าที่ตรงกับการค้นหา
            <button type="button" onClick={() => { setQuery(""); resetFilters(); }} className="mt-3 block w-full font-semibold text-stone-900 underline">ล้างตัวกรอง</button>
          </div>
        )}
      </div>
    </div>
  );
}
