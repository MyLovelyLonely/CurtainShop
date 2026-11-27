"use client";
// รายละเอียดสินค้า 1 ชิ้น (กดการ์ดจากหน้าแคตตาล็อก) ดึงจาก GET /api/liff/catalog/{id}
// ยังไม่เสร็จ:
//   - ปุ่ม "จำลองในห้องฉัน" / "เอาเข้าตะกร้า" มีแค่หน้าตา ยังไม่มีหน้ารองรับ กดแล้วยังไม่เกิดอะไร
import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { useLiffData } from "@/components/liff/LiffProvider";
import { PageHeader} from "@/components/liff/PageHeader";
import { useCart } from "@/components/liff/CartProvider";
import { MAX_QTY } from "@/lib/quantity"; // จำนวนสูงสุดต่อรายการ (ใช้ค่าเดียวกับตะกร้าและ server)


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

{/*
function BackButton({ className = "" }: { className?: string }) {
  return (
    <Link href="/liff/catalog" aria-label="กลับไปหน้าแคตตาล็อก"
      className={`flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm ${className}`}>
      <ArrowLeft size={16} /> กลับ
    </Link>
  );
}
*/}

export default function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useLiffData<{ product: Product }>(`/api/liff/catalog/${id}`);
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set()); // รูปที่โหลดไม่ขึ้น
  // จำนวนสินค้าที่จะใส่ตะกร้า (เฉพาะอุปกรณ์) เริ่มที่ 1
  // เก็บเป็นข้อความ เพราะลูกค้าพิมพ์เองได้ และระหว่างพิมพ์ช่องอาจว่าง (ลบเลขเดิมก่อนพิมพ์ใหม่)
  // ต้องประกาศตรงนี้ ก่อน if (error) return ... เพราะ React ห้ามเรียก hook หลังจาก return ไปบางกรณี
  const [qtyText, setQtyText] = useState("1");
  const { add } = useCart(); // ใส่ของลงตะกร้า (ใบสรุปราคา)

  if (error)
    return (
      <div className="-mx-4 -mt-4">
      <PageHeader backHref="/liff/catalog" backLabel="แคตตาล็อก" />
      <p className="py-16 text-center text-stone-500">{error}</p>
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

  // ---------- จำนวนสินค้า ----------
  const qty = Number(qtyText); // "" → 0

  // ตรวจจำนวน: คืนข้อความ error หรือ "" ถ้าถูกต้อง
  const qtyError =
    qtyText === "" ? "กรุณาใส่จำนวน"
    : qty < 1 ? "จำนวนต้องอย่างน้อย 1 ชิ้น"
    : qty > MAX_QTY ? `จำนวนต้องไม่เกิน ${MAX_QTY} ชิ้น`
    : "";

  // พิมพ์ในช่อง: ตัดทุกอย่างที่ไม่ใช่ตัวเลขทิ้ง (\D = ไม่ใช่ตัวเลข) จึงพิมพ์ได้แค่ 0-9
  function handleQtyInput(value: string) {
    setQtyText(value.replace(/\D/g, ""));
  }

  // บีบตัวเลขให้อยู่ในช่วง 1..MAX_QTY (ใช้กับปุ่ม − / +)
  const clamp = (n: number) => Math.min(MAX_QTY, Math.max(1, n));
  function decrease() {
    setQtyText(String(clamp(qty - 1)));
  }
  function increase() {
    setQtyText(String(clamp(qty + 1)));
  }

  function handleAdd(){
    if (qtyError) return; // จำนวนไม่ถูกต้อง ไม่ใส่ตะกร้า (ปุ่มถูกปิดไว้แล้ว กันไว้อีกชั้น)
    add({ product_id: p.product_id, quantity: qty }); // ไอคอนตะกร้าอัปเดตเลขและเด้งเอง
    setQtyText("1"); // รีเซ็ตช่องจำนวน พร้อมใส่รอบถัดไป
  }

  return (
    <div className="-mx-4 -mt-4 pb-4">
      <PageHeader backHref="/liff/catalog" backLabel="แคตตาล็อก" />
      <div className="relative aspect-square bg-stone-100">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element -- รูปจาก R2 / ลิงก์ภายนอก ยังไม่ได้ตั้ง next/image remotePatterns
          <img src={current} alt={p.name} className="size-full object-cover"
            onError={() => setBroken((prev) => new Set(prev).add(current))} />
        ) : (
          <div className="flex size-full items-center justify-center text-stone-400">ไม่มีรูป</div>
        )}
        {/*<BackButton className="absolute left-3 top-3" />*/}
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
        {/* TODO: ยังไม่มีหน้าจำลอง ปุ่มเลยยังไม่ทำงาน */}
        {/* หมวดอุปกรณ์ (ราง ขาจับ ฯลฯ) จำลองในห้องไม่ได้ ไม่มีปุ่มนี้ */}
        {!p.category.includes("อุปกรณ์") && (
          <button type="button" className="flex-1 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-semibold text-stone-800 active:bg-stone-100">
            จำลองในห้องฉัน
          </button>
        )}
        {!p.category.includes("อุปกรณ์") && (
           <Link href={`/liff/catalog/${p.product_id}/measure`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white active:bg-stone-700">
            ประเมินราคา
          </Link>
        )}
        {p.category.includes("อุปกรณ์") && (
          <div className="flex-1 space-y-1.5">
            <div className="flex gap-3">
              {/* ตัวเลือกจำนวน  [ − ] [ 2 ] [ + ]  กดปุ่มหรือพิมพ์เองก็ได้ */}
              <div className={`flex items-center rounded-xl border bg-white ${qtyError ? "border-red-400" : "border-stone-300"}`}>
                <button type="button" onClick={decrease} disabled={qty <= 1} aria-label="ลดจำนวน"
                  className="px-3 py-2.5 text-stone-700 disabled:text-stone-300">
                  <Minus size={16} />
                </button>
                {/* inputMode="numeric" = มือถือเปิดแป้นตัวเลข */}
                <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3}
                  value={qtyText} onChange={(e) => handleQtyInput(e.target.value)}
                  aria-label="จำนวน" aria-invalid={!!qtyError}
                  className="w-10 bg-transparent text-center text-sm font-semibold outline-none" />
                <button type="button" onClick={increase} disabled={qty >= MAX_QTY} aria-label="เพิ่มจำนวน"
                  className="px-3 py-2.5 text-stone-700 disabled:text-stone-300">
                  <Plus size={16} />
                </button>
              </div>
              <button type="button" disabled={!!qtyError}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white active:bg-stone-700 disabled:bg-stone-300"
                onClick={handleAdd}>
                นำสินค้าเข้าตะกร้า
              </button>
            </div>
            {qtyError && <p className="text-sm text-red-600" role="alert">{qtyError}</p>}
          </div>
        )}
        
      </div>
        
    </div>
  );
}
