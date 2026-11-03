"use client";
// รายละเอียดสินค้า 1 ชิ้น (กดการ์ดจากหน้าแคตตาล็อก) ดึงจาก GET /api/liff/catalog/{id}
// ยังไม่เสร็จ:
//   - ปุ่ม "จำลองในห้องฉัน" / "เอาเข้าตะกร้า" มีแค่หน้าตา ยังไม่มีหน้ารองรับ กดแล้วยังไม่เกิดอะไร
import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { useLiffData } from "@/components/liff/LiffProvider";

const LIGHT_LABEL: Record<string, string> = { sheer: "โปร่งแสง", dimout: "กรองแสง", blackout: "ทึบแสง" };

type Details = {
  code?: string; collection?: string; pattern_name?: string; pattern_type?: string; colors?: string[];
  composition?: string; width_cm?: number | null; repeat_cm?: number | null; light_filter?: string;
  care?: string; tags?: string[]; images?: string[];
};
type Product = {
  product_id: number; name: string; base_price: number; price_unit: string; image_url: string | null;
  description: string | null; category: string; catalog: string; details: Details;
};

const money = (n: number) => `฿${n.toLocaleString("th-TH")}`;

function BackButton({ className = "" }: { className?: string }) {
  return (
    <Link href="/liff/catalog" aria-label="กลับไปหน้าแคตตาล็อก"
      className={`flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm ${className}`}>
      <ArrowLeft size={16} /> กลับ
    </Link>
  );
}

export default function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useLiffData<{ product: Product }>(`/api/liff/catalog/${id}`);
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set()); // รูปที่โหลดไม่ขึ้น

  if (error)
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-stone-500">{error}</p>
        <BackButton className="mx-auto w-fit border border-stone-300" />
      </div>
    );
  if (!data) return <div className="-mx-4 -mt-4 aspect-square animate-pulse bg-stone-200" />;

  const p = data.product;
  const d = p.details;
  // รูปหลักใน details.images ถ้าไม่มีใช้ image_url / ตัดรูปที่โหลดไม่ขึ้นออก
  const images = (d.images?.length ? d.images : p.image_url ? [p.image_url] : []).filter((src) => !broken.has(src));
  const current = images[Math.min(active, images.length - 1)];

  const specs: [string, string | null | undefined][] = [
    ["รหัสสินค้า", d.code],
    ["หมวด", p.category],
    ["แคตตาล็อก", p.catalog],
    ["คอลเลคชั่น", d.collection],
    ["ชื่อลาย", d.pattern_name],
    ["ประเภทลาย", d.pattern_type],
    ["สี", d.colors?.join(", ")],
    ["ส่วนประกอบ", d.composition],
    ["หน้ากว้าง", d.width_cm != null ? `${d.width_cm} ซม.` : null],
    ["ระยะซ้ำลาย", d.repeat_cm ? `${d.repeat_cm} ซม.` : null],
    ["การกรองแสง", d.light_filter ? LIGHT_LABEL[d.light_filter] ?? d.light_filter : null],
    ["การดูแลรักษา", d.care],
  ];

  return (
    <div className="-mx-4 -mt-4 pb-4">
      <div className="relative aspect-square bg-stone-100">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element -- รูปจาก R2 / ลิงก์ภายนอก ยังไม่ได้ตั้ง next/image remotePatterns
          <img src={current} alt={p.name} className="size-full object-cover"
            onError={() => setBroken((prev) => new Set(prev).add(current))} />
        ) : (
          <div className="flex size-full items-center justify-center text-stone-400">ไม่มีรูป</div>
        )}
        <BackButton className="absolute left-3 top-3" />
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pt-3">
          {images.map((src, i) => (
            <button key={src} type="button" onClick={() => setActive(i)} aria-label={`รูปที่ ${i + 1}`}
              className={`size-14 shrink-0 overflow-hidden rounded-lg border-2 ${src === current ? "border-primary" : "border-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- เหมือนรูปหลักด้านบน */}
              <img src={src} alt="" className="size-full object-cover" onError={() => setBroken((prev) => new Set(prev).add(src))} />
            </button>
          ))}
        </div>
      )}

      <section className="space-y-2 px-4 pt-4">
        {d.code && <p className="text-xs text-stone-400">{d.code}</p>}
        <h1 className="text-xl font-semibold leading-snug">{p.name}</h1>
        <p className="text-2xl font-semibold tabular-nums text-primary">
          {money(p.base_price)}
          <span className="text-sm font-normal text-stone-500"> / {p.price_unit}</span>
        </p>
        {!!d.tags?.length && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {d.tags.map((t) => <span key={t} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">#{t}</span>)}
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
        <dl className="divide-y divide-stone-100 rounded-2xl border border-border bg-card text-sm">
          {specs.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex gap-4 px-4 py-2.5">
              <dt className="w-28 shrink-0 text-stone-500">{k}</dt>
              <dd className="flex-1">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex gap-3 px-4 pt-6">
        {/* TODO: ยังไม่มีหน้าจำลอง / ระบบตะกร้า ปุ่มเลยยังไม่ทำงาน */}
        {/* สีเดียวกับชิป/ปุ่มในหน้าแคตตาล็อก (ขาวขอบเทา / ดำ) */}
        {/* หมวดอุปกรณ์ (ราง ขาจับ ฯลฯ) จำลองในห้องไม่ได้ ไม่มีปุ่มนี้ */}
        {!p.category.includes("อุปกรณ์") && (
          <button type="button" className="flex-1 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-semibold text-stone-800 active:bg-stone-100">
            จำลองในห้องฉัน
          </button>
        )}
        <button type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white active:bg-stone-700">
          <ShoppingCart size={16} aria-hidden="true" /> นำสินค้าเข้าตะกร้า
        </button>
      </div>
    </div>
  );
}
