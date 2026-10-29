"use client";

// จำลองผ้าม่าน (หัวข้อ 2.5.4): ถ่าย/เลือกรูปห้อง → YOLOv11 หาหน้าต่าง → ลูกค้าปรับกรอบ → เลือกแบบม่าน → แสดงผล

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/fetcher";
import { LIGHT_FILTERS, canOptimize, formatPrice, type ProductView } from "@/types/catalog";
import {
  CURTAIN_STYLES,
  DEFAULT_OPTIONS,
  MAX_REGIONS,
  boxToQuad,
  toRegion,
  usesFloor,
  type CurtainStyle,
  type Point,
  type Quad,
  type Region,
  type RenderOptions,
  type RenderResult,
  type SimulatePhoto,
} from "@/types/simulate";

/** กรอบใหม่ (จุดที่ n): วางกลางรูปแล้วเลื่อนทแยงไม่ให้ทับกรอบเดิมพอดี */
const newRegion = (n: number): Region => {
  const o = (n % 4) * 0.05;
  return toRegion(boxToQuad([0.3 + o, 0.2 + o, 0.65 + o, 0.62 + o]));
};

/** ย่อรูปก่อนอัปโหลด (และหมุนตาม EXIF ไปในตัว) ให้ส่งเร็วบนมือถือ */
async function shrink(file: File, max = 2000): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * s);
    canvas.height = Math.round(bmp.height * s);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error())), "image/jpeg", 0.88),
    );
  } catch {
    return file;
  }
}

export default function SimulateStudio() {
  const router = useRouter();
  const productId = Number(useSearchParams().get("productId")) || null;

  const [product, setProduct] = useState<ProductView | null>(null);
  const [picking, setPicking] = useState(!productId);
  const [photo, setPhoto] = useState<SimulatePhoto | null>(null);
  const [uploading, setUploading] = useState(false);
  const [regions, setRegions] = useState<Region[]>([newRegion(0)]);
  const [active, setActive] = useState(0);
  const [style, setStyle] = useState<CurtainStyle>("pleated");
  const [opts, setOpts] = useState<RenderOptions>(DEFAULT_OPTIONS);
  const [rendered, setRendered] = useState<{ key: string; result: RenderResult } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const cache = useRef(new Map<string, RenderResult>());

  useEffect(() => {
    if (!productId) return;
    api<ProductView>(`/api/catalog/products/${productId}`)
      .then(setProduct)
      .catch((e) => setError(e.message));
  }, [productId]);

  // แสดงผลเฉพาะเมื่อตรงกับค่าปัจจุบัน: เปลี่ยนแบบ/ตัวเลือก/กรอบ → กลับไปหน้าแก้ไข (ผลเดิมเก็บไว้ใน cache)
  const input = photo && product && { photo_url: photo.photo_url, product_id: product.product_id, style, regions, ...opts };
  const key = JSON.stringify(input);
  const result = rendered?.key === key ? rendered.result : null;
  const setResult = (r: RenderResult | null) => setRendered(r && { key, result: r });

  const choose = (p: ProductView) => {
    setProduct(p);
    setPicking(false);
    router.replace(`/simulate?productId=${p.product_id}`, { scroll: false });
  };

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.set("photo", await shrink(file), "room.jpg");
      const p = await api<SimulatePhoto>("/api/simulate/photo", { method: "POST", body: form });
      setPhoto(p);
      // ทุกหน้าต่างที่ YOLO มั่นใจพอ (อย่างน้อยครึ่งหนึ่งของอันที่มั่นใจที่สุด) เป็นจุดตั้งต้น ลูกค้าลบ/เพิ่มเองได้
      const top = p.windows[0]?.score ?? 0;
      const found = p.windows.filter((w) => w.score >= top * 0.5).slice(0, MAX_REGIONS);
      setRegions(found.length ? found.map((w) => toRegion(boxToQuad(w.box))) : [newRegion(0)]);
      setActive(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function simulate() {
    if (!input) return;
    const hit = cache.current.get(key);
    if (hit) return setResult(hit);
    setError("");
    setRendering(true);
    try {
      const r = await api<RenderResult>("/api/simulate/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      cache.current.set(key, r);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ไม่สามารถสร้างภาพจำลองได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col pb-28">
      <header className="flex items-center gap-3 px-4 pb-3 pt-4">
        <Link href={product ? `/catalog/${product.product_id}` : "/catalog"} className="text-sm text-stone-500">
          ← กลับ
        </Link>
        <h1 className="text-lg font-semibold">จำลองผ้าม่านในห้องคุณ</h1>
      </header>

      <section className="px-4">
        <ProductBar product={product} onChange={() => setPicking(true)} />
      </section>

      <section className="px-4 pt-4">
        {!photo ? (
          <PhotoPicker uploading={uploading} onFile={upload} />
        ) : result ? (
          <Compare before={photo} after={result} />
        ) : (
          <>
            <RegionEditor
              photo={photo}
              regions={regions}
              active={active}
              onChange={setRegions}
              onSelect={setActive}
              showFloor={usesFloor(style, opts)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {regions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`rounded-full border px-2.5 py-1 ${
                    i === active ? "border-brand bg-brand-soft text-brand" : "border-stone-300 bg-white text-stone-600"
                  }`}
                >
                  จุด {i + 1}
                </button>
              ))}
              <button
                onClick={() => {
                  setRegions([...regions, newRegion(regions.length)]);
                  setActive(regions.length);
                }}
                disabled={regions.length >= MAX_REGIONS}
                className="rounded-full border border-dashed border-stone-400 px-2.5 py-1 text-stone-600 disabled:opacity-40"
              >
                + เพิ่มจุด
              </button>
              <button
                onClick={() => {
                  setRegions(regions.filter((_, i) => i !== active));
                  setActive(Math.max(0, active - 1));
                }}
                disabled={regions.length <= 1}
                className="px-1 text-red-600 disabled:opacity-40"
              >
                ลบจุด {active + 1}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-stone-500">
              {photo.windows.length ? "" : "ไม่พบหน้าต่างอัตโนมัติ — "}
              ลากมุมทั้ง 4 ให้ตรงกับขอบหน้าต่าง (หน้าต่างที่ถ่ายเอียงก็ลากมุมเอียงตามได้) ลากตรงกลางกรอบเพื่อย้าย
              {" · ลากจุด “ราง” ไปวางที่ความสูงที่จะติดราง"}
              {usesFloor(style, opts) && " · ลากจุด “พื้น” ไปวางตรงแนวที่พื้นชนผนังใต้หน้าต่าง ม่านจะยาวลงมาถึงตรงนั้น"}
            </p>
          </>
        )}
        {photo && (
          <label className="mt-3 inline-block cursor-pointer text-sm text-brand">
            เปลี่ยนรูปห้อง
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading || rendering}
              onChange={(e) => {
                setResult(null);
                upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </section>

      {photo && (
        <section className="space-y-4 px-4 pt-4">
          <StylePicker value={style} onChange={setStyle} />
          <StyleOptions style={style} opts={opts} onChange={setOpts} />
          {result && (
            <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs leading-relaxed text-stone-500">
              ภาพจำลองช่วยในการเลือกผ้าเบื้องต้นเท่านั้น สีและลายจริงอาจต่างไปตามแสง ช่างจะนำผ้าตัวอย่างไปให้ดูในวันสำรวจหน้างาน
              {!result.refined && " (ภาพนี้ยังไม่ได้เกลาแสงเงาด้วย AI)"}
            </p>
          )}
        </section>
      )}

      {error && <p className="mx-4 mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {photo && (
        <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-md gap-3 px-4 py-3">
            {result ? (
              <>
                <button onClick={() => setResult(null)} className="btn-outline flex-1">
                  ปรับกรอบ/ลองแบบอื่น
                </button>
                <Link href={`/estimate?productId=${product?.product_id ?? ""}`} className="btn-primary flex-1">
                  ประเมินราคา
                </Link>
              </>
            ) : (
              <button onClick={simulate} disabled={!product || rendering} className="btn-primary flex-1 py-3">
                {rendering ? <Elapsed label="กำลังสร้างภาพจำลอง" /> : `จำลอง${CURTAIN_STYLES[style].label}`}
              </button>
            )}
          </div>
        </div>
      )}

      {picking && <ProductPicker onPick={choose} onClose={product ? () => setPicking(false) : undefined} />}
    </div>
  );
}

function Elapsed({ label }: { label: string }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span>
      {label}… {s} วิ
    </span>
  );
}

function ProductBar({ product, onChange }: { product: ProductView | null; onChange: () => void }) {
  return (
    <div className="card flex items-center gap-3 p-2.5">
      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-stone-100">
        {product?.image_url && (
          <Image
            src={product.image_url}
            alt=""
            fill
            unoptimized={!canOptimize(product.image_url)}
            sizes="56px"
            className="object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {product ? (
          <>
            <p className="text-[11px] text-stone-400">{product.details.code}</p>
            <p className="truncate text-sm font-medium">{product.name}</p>
            <p className="text-xs text-stone-500">
              ฿{formatPrice(product.base_price)} / {product.price_unit}
              {product.details.light_filter && ` · ${LIGHT_FILTERS[product.details.light_filter].split(" (")[0]}`}
            </p>
          </>
        ) : (
          <p className="text-sm text-stone-500">ยังไม่ได้เลือกผ้า</p>
        )}
      </div>
      <button onClick={onChange} className="shrink-0 px-2 text-sm text-brand">
        {product ? "เปลี่ยนผ้า" : "เลือกผ้า"}
      </button>
    </div>
  );
}

function PhotoPicker({ uploading, onFile }: { uploading: boolean; onFile: (f: File | undefined) => void }) {
  return (
    <label
      className={`card flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 border-dashed text-center ${
        uploading ? "animate-pulse" : ""
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-10 text-stone-400" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" strokeLinejoin="round" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
      <span className="font-medium">{uploading ? "กำลังอัปโหลดและหาหน้าต่าง…" : "ถ่ายรูปหรือเลือกรูปห้อง"}</span>
      <span className="px-8 text-xs text-stone-500">ถ่ายตรงหน้าหน้าต่าง ให้เห็นผนังรอบ ๆ และพื้นห้อง</span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}

type Drag = { region: number; handle: number | "floor" | "rail" | null; x: number; y: number; start: Region };

/**
 * กรอบหน้าต่างหลายจุด แต่ละจุดเป็นสี่เหลี่ยม 4 มุมที่ลากมุมได้อิสระ (หน้าต่างที่ถ่ายเอียง) + จุดพื้น
 * หลัง YOLOv11 ทำงานเสร็จ ลูกค้ายืนยันกรอบสุดท้ายเอง
 */
function RegionEditor(props: {
  photo: SimulatePhoto;
  regions: Region[];
  active: number;
  onChange: (r: Region[]) => void;
  onSelect: (i: number) => void;
  showFloor: boolean;
}) {
  const { photo, regions, active, onChange, onSelect, showFloor } = props;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const down = (e: React.PointerEvent<Element>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const el = e.currentTarget as HTMLElement | SVGElement;
    const region = Number(el.dataset.region);
    const h = el.dataset.handle;
    const handle = h === undefined ? null : h === "floor" || h === "rail" ? h : Number(h);
    onSelect(region);
    drag.current = { region, handle, x: e.clientX, y: e.clientY, start: regions[region] };
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = ref.current?.getBoundingClientRect();
    if (!d || !rect) return;
    let dx = (e.clientX - d.x) / rect.width;
    let dy = (e.clientY - d.y) / rect.height;
    const c = (v: number) => Math.min(1, Math.max(0, v));
    const s = d.start;
    let r: Region;
    if (d.handle === null) {
      // ย้ายทั้งกรอบ (จุดพื้น/จุดรางย้ายตาม) ไม่ให้หลุดขอบรูป
      const all = [...s.quad, s.floor, s.rail];
      const xs = all.map((p) => p[0]);
      const ys = all.map((p) => p[1]);
      dx = Math.min(1 - Math.max(...xs), Math.max(-Math.min(...xs), dx));
      dy = Math.min(1 - Math.max(...ys), Math.max(-Math.min(...ys), dy));
      const shift = ([x, y]: Point): Point => [x + dx, y + dy];
      r = { quad: s.quad.map(shift) as Quad, floor: shift(s.floor), rail: shift(s.rail) };
    } else if (d.handle === "floor" || d.handle === "rail") {
      const [x, y] = s[d.handle];
      r = { ...s, [d.handle]: [c(x + dx), c(y + dy)] };
    } else {
      r = { ...s, quad: s.quad.map((p, i) => (i === d.handle ? [c(p[0] + dx), c(p[1] + dy)] : p)) as Quad };
    }
    onChange(regions.map((x, i) => (i === d.region ? r : x)));
  };

  const pts = (q: Quad) => q.map(([x, y]) => `${x * 100},${y * 100}`);
  const end = () => (drag.current = null);
  return (
    <div
      ref={ref}
      className="relative touch-none select-none overflow-hidden rounded-xl bg-stone-200"
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <Image
        src={photo.photo_url}
        alt="รูปห้อง"
        width={photo.width}
        height={photo.height}
        sizes="448px"
        className="pointer-events-none h-auto w-full"
        priority
      />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        {/* หรี่นอกกรอบ */}
        <path
          d={["M0 0H100V100H0Z", ...regions.map(({ quad }) => "M" + pts(quad).join("L") + "Z")].join(" ")}
          fillRule="evenodd"
          fill="rgba(0,0,0,0.35)"
          className="pointer-events-none"
        />
        {regions.map(({ quad: q, rail: [rx, ry] }, i) => {
          // เส้นประจากขอบบนหน้าต่างขึ้นไปที่จุดราง + แนวราง (ขนานกับขอบบนของกรอบ)
          const mx = (q[0][0] + q[1][0]) / 2;
          const my = (q[0][1] + q[1][1]) / 2;
          const vx = (q[1][0] - q[0][0]) * 0.65;
          const vy = (q[1][1] - q[0][1]) * 0.65;
          return (
            <g key={i} className="pointer-events-none" opacity={i === active ? 1 : 0.6}>
              <line
                x1={mx * 100}
                y1={my * 100}
                x2={rx * 100}
                y2={ry * 100}
                stroke="white"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={(rx - vx) * 100}
                y1={(ry - vy) * 100}
                x2={(rx + vx) * 100}
                y2={(ry + vy) * 100}
                stroke="#0ea5e9"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
        {showFloor &&
          regions.map(({ quad: q, floor: [fx, fy] }, i) => {
            // เส้นประจากขอบล่างหน้าต่างลงมาที่จุดพื้น + แนวพื้น (ขนานกับขอบล่างของกรอบ)
            const mx = (q[2][0] + q[3][0]) / 2;
            const my = (q[2][1] + q[3][1]) / 2;
            const vx = (q[2][0] - q[3][0]) * 0.65;
            const vy = (q[2][1] - q[3][1]) * 0.65;
            return (
              <g key={i} className="pointer-events-none" opacity={i === active ? 1 : 0.6}>
                <line
                  x1={mx * 100}
                  y1={my * 100}
                  x2={fx * 100}
                  y2={fy * 100}
                  stroke="white"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={(fx - vx) * 100}
                  y1={(fy - vy) * 100}
                  x2={(fx + vx) * 100}
                  y2={(fy + vy) * 100}
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        {regions.map(({ quad }, i) => (
          <polygon
            key={i}
            points={pts(quad).join(" ")}
            fill="rgba(255,255,255,0.001)"
            stroke={i === active ? "var(--color-brand)" : "white"}
            strokeWidth={i === active ? 3 : 2}
            vectorEffect="non-scaling-stroke"
            className="cursor-move"
            data-region={i}
            onPointerDown={down}
          />
        ))}
      </svg>
      {regions.map(({ quad: q }, i) => {
        const cx = q.reduce((s, p) => s + p[0], 0) / 4;
        const cy = q.reduce((s, p) => s + p[1], 0) / 4;
        return (
          <span
            key={i}
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-xs font-medium shadow ${
              i === active ? "bg-brand text-white" : "bg-white/90 text-stone-700"
            }`}
            style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
          >
            {i + 1}
          </span>
        );
      })}
      {regions[active]?.quad.map(([x, y], k) => (
        <span
          key={k}
          data-region={active}
          data-handle={k}
          onPointerDown={down}
          className="absolute size-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-brand shadow"
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
        />
      ))}
      {regions[active] && (
        <span
          data-region={active}
          data-handle="rail"
          onPointerDown={down}
          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-sky-500 px-2 py-0.5 text-[11px] font-medium text-white shadow"
          style={{ left: `${regions[active].rail[0] * 100}%`, top: `${regions[active].rail[1] * 100}%` }}
        >
          ราง
        </span>
      )}
      {showFloor && regions[active] && (
        <span
          data-region={active}
          data-handle="floor"
          onPointerDown={down}
          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white shadow"
          style={{ left: `${regions[active].floor[0] * 100}%`, top: `${regions[active].floor[1] * 100}%` }}
        >
          พื้น
        </span>
      )}
    </div>
  );
}

/** เลื่อนแถบเพื่อเทียบก่อน/หลังติดม่าน */
function Compare({ before, after }: { before: SimulatePhoto; after: RenderResult }) {
  const [pos, setPos] = useState(100);
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-stone-200">
        <Image
          src={before.photo_url}
          alt="ก่อน"
          width={before.width}
          height={before.height}
          sizes="448px"
          className="h-auto w-full"
        />
        <Image
          src={after.result_url}
          alt="ภาพจำลองผ้าม่าน"
          width={before.width}
          height={before.height}
          sizes="448px"
          className="absolute inset-0 h-full w-full"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          priority
        />
        {pos > 0 && pos < 100 && (
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} />
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-stone-500">
        <span>ก่อน</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          className="flex-1 accent-brand"
          aria-label="เทียบก่อนและหลัง"
        />
        <span>หลัง</span>
        <a href={after.result_url} target="_blank" rel="noreferrer" className="text-brand">
          เปิดรูปเต็ม
        </a>
      </div>
    </div>
  );
}

function StyleIcon({ style }: { style: CurtainStyle }) {
  return (
    <svg viewBox="0 0 40 32" className="h-8 w-10" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="9" y="6" width="22" height="20" className="opacity-30" />
      {style === "pleated" && (
        <>
          <path d="M4 4h32" strokeWidth={2} />
          <path d="M6 4v26M8.5 4v26M11 4v26M13.5 4v26M26.5 4v26M29 4v26M31.5 4v26M34 4v26" />
        </>
      )}
      {style === "roller" && (
        <>
          <rect x="8" y="3" width="24" height="3" rx="1.5" />
          <rect x="9" y="6" width="22" height="12" fill="currentColor" className="opacity-20" />
          <path d="M9 18h22" strokeWidth={2} />
        </>
      )}
      {style === "louis" && (
        <>
          <path d="M7 4h26" strokeWidth={2} />
          <path d="M7 4v14q4.4 5 8.8 0q4.4 5 8.8 0q4.4 5 8.4 0V4" />
          <path d="M8 9q3.5 2 7.5 0q4.5 2 9 0q4 2 8 0M8 13q3.5 2 7.5 0q4.5 2 9 0q4 2 8 0" className="opacity-60" />
        </>
      )}
    </svg>
  );
}

function StylePicker({ value, onChange }: { value: CurtainStyle; onChange: (s: CurtainStyle) => void }) {
  return (
    <div>
      <h2 className="mb-2 font-medium">รูปแบบม่าน</h2>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(CURTAIN_STYLES) as CurtainStyle[]).map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`card flex flex-col items-center gap-1 px-2 py-3 text-sm transition ${
              value === s ? "border-brand bg-brand-soft text-brand ring-1 ring-brand" : "text-stone-600"
            }`}
          >
            <StyleIcon style={s} />
            {CURTAIN_STYLES[s].label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-stone-500">{CURTAIN_STYLES[value].hint}</p>
    </div>
  );
}

function StyleOptions({
  style,
  opts,
  onChange,
}: {
  style: CurtainStyle;
  opts: RenderOptions;
  onChange: (o: RenderOptions) => void;
}) {
  const set = (patch: Partial<RenderOptions>) => onChange({ ...opts, ...patch });
  if (style === "pleated" || style === "louis")
    return (
      <div className="space-y-3">
        <Slider
          label="รูดม่านเปิด"
          value={opts.open_ratio}
          min={0}
          onChange={(v) => set({ open_ratio: v })}
          left="ปิดสนิท"
          right="เปิดสุด"
        />
        <Segmented
          value={opts.length}
          onChange={(length) => set({ length })}
          items={[
            ["floor", "ยาวถึงพื้น"],
            ["sill", "ถึงขอบหน้าต่าง"],
          ]}
        />
      </div>
    );
  return (
    <Slider
      label="ความยาวที่ลงมา"
      value={opts.drop}
      min={0.2}
      onChange={(v) => set({ drop: v })}
      left="ม้วนขึ้น"
      right="ปิดทั้งบาน"
    />
  );
}

function Segmented<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  items: [T, string][];
}) {
  return (
    <div className="flex gap-2 text-sm">
      {props.items.map(([v, label]) => (
        <button
          key={v}
          onClick={() => props.onChange(v)}
          className={`flex-1 rounded-lg border px-3 py-2 ${
            props.value === v ? "border-brand bg-brand-soft text-brand" : "border-stone-300 bg-white text-stone-600"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
  left: string;
  right: string;
}) {
  // เลื่อนแล้วค่อยส่งค่าตอนปล่อย จะได้ไม่ล้างผลจำลองระหว่างลาก
  const [dragging, setDragging] = useState<number | null>(null);
  const v = dragging ?? props.value;
  const commit = () => {
    if (dragging !== null) props.onChange(dragging);
    setDragging(null);
  };
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium">{props.label}</span>
        <span className="text-stone-500">{Math.round(v * 100)}%</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={1}
        step={0.05}
        value={v}
        onChange={(e) => setDragging(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        className="w-full accent-brand"
      />
      <div className="flex justify-between text-[11px] text-stone-400">
        <span>{props.left}</span>
        <span>{props.right}</span>
      </div>
    </div>
  );
}

function ProductPicker({ onPick, onClose }: { onPick: (p: ProductView) => void; onClose?: () => void }) {
  const [products, setProducts] = useState<ProductView[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<ProductView[]>("/api/catalog/products")
      .then(setProducts)
      .catch((e) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (products ?? [])
      .filter((p) => p.image_url)
      .filter((p) => {
        const hay = [p.name, p.details.code, p.details.pattern_name, ...p.details.colors].join(" ").toLowerCase();
        return words.every((w) => hay.includes(w));
      });
  }, [products, q]);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="font-semibold">เลือกผ้าที่จะจำลอง</h2>
          {onClose ? (
            <button onClick={onClose} className="text-sm text-stone-500">
              ปิด
            </button>
          ) : (
            <Link href="/catalog" className="text-sm text-stone-500">
              ไปหน้าสินค้า
            </Link>
          )}
        </div>
        <div className="px-4 pb-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา ชื่อ รหัส สี…"
            className="input rounded-full px-4"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {error && <p className="text-sm text-red-700">{error}</p>}
          {!products && !error && <p className="py-8 text-center text-sm text-stone-400">กำลังโหลด…</p>}
          {products && !shown.length && <p className="py-8 text-center text-sm text-stone-400">ไม่พบผ้าที่ค้นหา</p>}
          <div className="grid grid-cols-3 gap-2">
            {shown.map((p) => (
              <button key={p.product_id} onClick={() => onPick(p)} className="card overflow-hidden text-left">
                <div className="relative aspect-square bg-stone-100">
                  <Image src={p.image_url!} alt={p.name} fill unoptimized={!canOptimize(p.image_url!)} sizes="150px" className="object-cover" />
                </div>
                <p className="truncate px-1.5 py-1 text-[11px]">{p.details.code}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
