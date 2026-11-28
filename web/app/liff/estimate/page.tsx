"use client";
// ใบประเมินราคาฝั่งลูกค้า (Use Case 4-5) โครงเดียวกับใบเสนอราคา แต่เป็นเอกสารในระบบ ไม่ส่งเข้า FlowAccount
//   ขั้น 1 สรุปราคา: รายการจากตะกร้า ติ๊กเลือก -> "จัดทำใบประเมินราคา"
//   ขั้น 2 ใบประเมินราคา: ดูแบบเอกสาร -> "ส่งใบประเมินราคา" ให้แอดมิน / กด "แก้ไข" แก้ข้อมูลผู้ซื้อบนเอกสาร
//   ส่ง = POST /api/liff/estimates บันทึกลง price_estimate + price_estimate_item ข้อมูลลูกค้าที่แก้เก็บใน price_estimate.details.billing (ไม่แก้ข้อมูลของฉัน)
//   ส่งสำเร็จ = ลบรายการที่ส่งออกจากตะกร้า (รายการที่ไม่ได้ติ๊กยังอยู่)
// ยังไม่เสร็จ:
//   - ปุ่มบันทึกรูป / Export PDF ยังไม่ทำงาน
import { useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2, ChevronLeft, Download, FileText, PencilLine, Send, Trash2 } from "lucide-react";
import { baht, thDate } from "@/components/admin/ui";
import { useApi, useLiffData } from "@/components/liff/LiffProvider";
import { useCart, type CartItem } from "@/components/liff/CartProvider";
import { Panel } from "@/components/liff/ui";
import { BuyerGrid, cleanEstimateBuyer, EstimateBuyerForm, estimateBuyerFrom, estimateBuyerMissing, type EstimateBuyer, type Me } from "@/components/liff/BuyerInfo";
import { isAreaUnit, lineArea, lineTotal, missingSize } from "@/lib/pricing";
import { r2, VAT_RATE } from "@/lib/documents";

// ============================================================
// บล็อก 1: ชนิดข้อมูล
// ============================================================
// สินค้าจาก GET /api/liff/catalog (ใช้แค่ชื่อ ราคา หน่วย)
type Product = { product_id: number; name: string; base_price: number; price_unit: string };

// 1 บรรทัดในใบสรุปราคา = ของในตะกร้า + ชื่อ/ราคา/หน่วยจากแคตตาล็อก
//   id = key ของรายการในตะกร้า (ใช้ติ๊กเลือก และลบออกจากตะกร้าหลังส่ง)
type Item = { id: string; product_id: number; name: string; price_unit: string; width: number | null; height: number | null; quantity: number; unit_price: number };

// ============================================================
// บล็อก 2: รวมตะกร้ากับแคตตาล็อก + คิดยอด
// ============================================================
// ตะกร้าเก็บแค่ product_id กับขนาด/จำนวน (ไม่เก็บราคา) → เติมชื่อ ราคา หน่วย จากแคตตาล็อกล่าสุด
// สินค้าที่ไม่มีในแคตตาล็อกแล้ว (ร้านปิดหรือลบ) ข้ามไป
function joinCart(cart: CartItem[], products: Product[]): Item[] {
  const byId = new Map(products.map((p) => [p.product_id, p]));
  return cart.flatMap((c) => {
    const p = byId.get(c.product_id);
    if (!p) return [];
    return [{
      id: c.key, product_id: c.product_id, name: p.name, price_unit: p.price_unit,
      width: c.width ?? null, height: c.height ?? null, quantity: c.quantity, unit_price: p.base_price,
    }];
  });
}

// ยอดรวม: คิดเหมือน server (priceItems ใน lib/quotation.ts) ตัวเลขจะได้ตรงกัน
//   ทุกห้องใช้รายการเดียวกัน → ยอดต่อ 1 ห้อง × จำนวนห้อง แล้วค่อยบวก VAT
function sumUp(list: Item[], rooms: number) {
  const roomSubTotal = r2(list.reduce((s, i) => s + lineTotal(i, i.price_unit), 0));
  const subTotal = r2(roomSubTotal * rooms);
  const vat = r2(subTotal * VAT_RATE);
  return { rooms, roomSubTotal, subTotal, vat, total: r2(subTotal + vat) };
}

const MAX_ROOMS = 99; // กันค่าผิดปกติ (server ตรวจค่าเดียวกัน)

// ปุ่มรองให้เหมือนปุ่มเอกสารอื่น (components/liff/DocButton.tsx)
const SECONDARY = "w-full flex items-center justify-center gap-2 bg-card border-2 border-primary/60 text-primary shadow-sm rounded-xl py-2.5 text-base font-semibold active:bg-primary/10";

export default function LiffEstimate() {
  // ============================================================
  // บล็อก 3: ข้อมูลและ state ของหน้า
  // ============================================================
  const api = useApi();
  const me = useLiffData<Me>("/api/liff/me");
  const catalog = useLiffData<{ products: Product[] }>("/api/liff/catalog");
  const cart = useCart();
  // เก็บรายการที่ "ไม่ติ๊ก" แทนที่ติ๊ก → ของที่เพิ่งใส่ตะกร้าถูกติ๊กไว้เองโดยไม่ต้องตั้งค่าใหม่
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set());
  const [edited, setEdited] = useState<EstimateBuyer | null>(null);
  const [step, setStep] = useState<"summary" | "document">("summary");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sentId, setSentId] = useState<number | null>(null); // ส่งแล้ว = estimate_id
  const [sentItems, setSentItems] = useState<Item[] | null>(null); // รายการที่ส่งไป (ตะกร้าถูกลบแล้ว แต่ใบที่ส่งยังต้องโชว์)
  // จำนวนห้อง เก็บเป็นข้อความ เพราะระหว่างพิมพ์ช่องอาจว่าง
  const [roomText, setRoomText] = useState("1");

  // ข้อมูลผู้ซื้อ: ยังไม่แก้ = เติมจากโปรไฟล์ไว้ก่อน ลูกค้าแก้ / ลบเองได้ในโหมดแก้ไข
  const billing = edited ?? (me.data ? estimateBuyerFrom(me.data) : null);

  const loadError = me.error ?? catalog.error;
  if (loadError) return <Panel className="text-red-700 text-base">{loadError}</Panel>;
  if (!cart.loaded || !catalog.data || !billing) return <Panel className="text-center text-muted-foreground">กำลังโหลด...</Panel>;

  const items = joinCart(cart.items, catalog.data.products);
  const hiddenCount = cart.items.length - items.length; // ของในตะกร้าที่ไม่มีในแคตตาล็อกแล้ว
  // รายการที่ไม่มีขนาด (เช่น ใส่ตะกร้าไว้ก่อนหน่วยเมตรต้องกรอกกว้าง) ไม่นับรวม ต้องกรอกขนาดใหม่ก่อน
  const selected = items.filter((i) => !unpicked.has(i.id) && !missingSize(i, i.price_unit));
  const docItems = sentItems ?? selected; // ขั้น 2: ส่งแล้วโชว์ของที่ส่ง / ยังไม่ส่งโชว์ของที่ติ๊ก
  // จำนวนห้อง: ค่าไม่ถูกต้อง = คิดยอดเป็น 1 ห้องไว้ก่อน แต่กดต่อไม่ได้จนกว่าจะแก้
  const rooms = Number(roomText);
  const roomError = Number.isInteger(rooms) && rooms >= 1 && rooms <= MAX_ROOMS ? "" : `จำนวนห้องต้องเป็นเลข 1–${MAX_ROOMS}`;
  const roomsForPrice = roomError ? 1 : rooms;
  const summaryTotals = sumUp(selected, roomsForPrice);
  const docTotals = sumUp(docItems, roomsForPrice);

  const toggle = (id: string) => setUnpicked((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ช่องที่ต้องกรอก (ยังไม่ครบ = ส่งไม่ได้ บอกว่าขาดอะไร)
  const missing = estimateBuyerMissing(billing);
  const buyer = cleanEstimateBuyer(billing); // แสดงบนเอกสาร + ส่งไปบันทึก (price_estimate.details.billing)

  // ============================================================
  // บล็อก 4: ส่งใบประเมินราคา
  // ============================================================
  // ส่งแค่ product_id + ขนาด + จำนวน / server ดึงราคาจากตาราง product และคิดยอดใหม่เอง
  async function send() {
    setBusy(true); setMsg(null);
    try {
      const res = await api<{ estimate: { estimate_id: number } }>("/api/liff/estimates", {
        method: "POST",
        body: JSON.stringify({
          items: selected.map((i) => ({ product_id: i.product_id, width: i.width, height: i.height, quantity: i.quantity })),
          room_count: rooms,
          billing: buyer,
        }),
      });
      setSentItems(selected);                       // เก็บไว้โชว์บนใบที่ส่งแล้ว
      cart.removeMany(selected.map((i) => i.id));   // เอาออกจากตะกร้า
      setSentId(res.estimate.estimate_id);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  // ย้อนกลับจากใบที่ส่งแล้ว = เริ่มใบใหม่จากของที่เหลือในตะกร้า
  function backToSummary() {
    setStep("summary");
    if (sentId) { setSentId(null); setSentItems(null); }
  }

  // ============================================================
  // บล็อก 5: ขั้น 1 สรุปราคา
  // ============================================================
  if (step === "summary") {
    return (
      <>
        <Header title="สรุปราคา" back={<Link href="/liff/catalog" aria-label="ย้อนกลับ" className="-ml-2 p-2 text-muted-foreground"><ChevronLeft size={26} /></Link>} />
        {hiddenCount > 0 && (
          <Panel className="text-sm text-amber-900 bg-amber-50 border-amber-300">
            มี {hiddenCount} รายการในตะกร้าที่ไม่มีในแคตตาล็อกแล้ว จึงไม่แสดงในใบสรุปราคา
          </Panel>
        )}
        {items.length === 0 ? (
          <Panel className="space-y-3 text-center">
            <p className="text-base text-muted-foreground">ยังไม่มีสินค้าในใบสรุปราคา</p>
            <Link href="/liff/catalog" className="inline-block rounded-xl bg-primary px-5 py-2.5 text-base font-semibold text-primary-foreground">
              เลือกสินค้าจากแคตตาล็อก
            </Link>
          </Panel>
        ) : (
          <>
            <Panel className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-bold">ข้อมูลลูกค้า</p>
                <EditToggle editing={editing} onChange={setEditing} />
              </div>
              {editing ? <EstimateBuyerForm value={billing} onChange={setEdited} /> : <BuyerGrid buyer={buyer} />}
              <ItemTable items={items} unpicked={unpicked} onToggle={toggle} onRemove={cart.remove} />
              <Totals {...summaryTotals} roomInput={<RoomStepper value={roomText} onChange={setRoomText} error={roomError} />} roomError={roomError} />
              <Remarks />
            </Panel>
            <button onClick={() => { setStep("document"); setEditing(false); }} disabled={!selected.length || Boolean(roomError)}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 text-lg font-semibold disabled:opacity-50">
              จัดทำใบประเมินราคา
            </button>
          </>
        )}
      </>
    );
  }

  // ============================================================
  // บล็อก 6: ขั้น 2 ใบประเมินราคา
  // ============================================================
  return (
    <>
      <Header title="ใบประเมินราคา"
        back={<button onClick={backToSummary} aria-label="ย้อนกลับ" className="-ml-2 p-2 text-muted-foreground"><ChevronLeft size={26} /></button>}
        action={sentId ? null : <EditToggle editing={editing} onChange={setEditing} />} />

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* หัวเอกสาร */}
        <div className="bg-gradient-to-br from-[#5a3a12] to-[#2e1d08] text-white px-4 py-4 flex justify-between gap-3">
          <div>
            <p className="text-xs tracking-wider text-amber-300">ใบประเมินราคา / ESTIMATE</p>
            <p className="text-xl font-bold font-serif mt-1">ร้านผ้าม่าน</p>
          </div>
          <div className="text-right text-xs text-amber-100/90 space-y-0.5">
            <p className="font-mono text-sm text-white">{sentId ? `#${sentId}` : "ยังไม่ส่ง"}</p>
            <p>วันที่ {thDate(new Date().toISOString())}</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {editing ? <EstimateBuyerForm value={billing} onChange={setEdited} /> : <BuyerGrid buyer={buyer} />}
          <ItemTable items={docItems} />
          <Totals {...docTotals} />
          <Remarks />
        </div>
      </div>

      {msg && <Panel className="text-red-700 text-base">{msg}</Panel>}
      {!sentId && !editing && missing && (
        <button type="button" onClick={() => setEditing(true)}
          className="w-full text-left bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-base text-amber-900">
          กรุณากรอก{missing} ก่อนส่ง <span className="font-semibold underline">กดเพื่อแก้ไข</span>
        </button>
      )}
      {/* ส่งได้เมื่อแก้ไขเสร็จ และกรอกช่องที่ต้องกรอกครบ */}
      {sentId ? (
        <Panel className="flex items-center gap-3 border-2 border-emerald-200 bg-emerald-50">
          <CheckCircle2 size={32} className="text-emerald-600 shrink-0" />
          <div>
            <p className="text-lg font-semibold text-emerald-800">ส่งใบประเมินราคาแล้ว</p>
            <p className="text-sm text-emerald-900">ร้านจะติดต่อกลับเพื่อนัดวัดหน้างาน แล้วส่งใบเสนอราคาทาง LINE</p>
          </div>
        </Panel>
      ) : !editing && (
        <button type="button" onClick={send} disabled={busy || Boolean(missing) || !selected.length}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-xl py-4 text-lg font-semibold active:bg-emerald-700 disabled:opacity-50">
          <Send size={20} /> {busy ? "กำลังส่ง..." : "ส่งใบประเมินราคา"}
        </button>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className={SECONDARY}><Download size={18} /> บันทึกรูป</button>
        <button type="button" className={SECONDARY}><FileText size={18} /> Export PDF</button>
      </div>
    </>
  );
}

function Header({ title, back, action }: { title: string; back: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {back}
      <h1 className="text-2xl font-bold flex-1">{title}</h1>
      {action}
    </div>
  );
}

// ปุ่มแก้ไข / เสร็จ ของข้อมูลลูกค้า (ใช้ทั้งขั้นสรุปราคาและใบประเมินราคา)
function EditToggle({ editing, onChange }: { editing: boolean; onChange: (editing: boolean) => void }) {
  return editing ? (
    <button type="button" onClick={() => onChange(false)}
      className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-semibold">
      <Check size={16} /> เสร็จ
    </button>
  ) : (
    <button type="button" onClick={() => onChange(true)}
      className="flex items-center gap-1.5 bg-card border-2 border-primary/60 text-primary rounded-lg px-3 py-1.5 text-sm font-semibold">
      <PencilLine size={16} /> แก้ไข
    </button>
  );
}

// ตารางรายการ: ส่ง onToggle = มีช่องติ๊กเลือก / ส่ง onRemove = มีปุ่มลบ (ทั้งคู่ใช้แค่ขั้นสรุปราคา)
function ItemTable({ items, unpicked, onToggle, onRemove }: {
  items: Item[]; unpicked?: Set<string>; onToggle?: (id: string) => void; onRemove?: (id: string) => void;
}) {
  return (
    <div className="border-t border-border">
      <div className="flex justify-between gap-3 py-2 text-sm text-muted-foreground border-b border-border">
        <span>รายการ</span><span>รวม (฿)</span>
      </div>
      {items.map((i) => {
        const size = lineArea(i, i.price_unit); // ตร.ม.รวม / เมตรรวม / null = นับชิ้น
        const noSize = missingSize(i, i.price_unit); // ไม่มีขนาด = ไม่นับรวม ติ๊กไม่ได้ ต้องไปกรอกขนาดใหม่
        const off = noSize || (unpicked?.has(i.id) ?? false);
        // จำนวนที่คิดเงิน + หน่วย แบบคอลัมน์ "จำนวน / หน่วย / ราคาต่อหน่วย" ของ FlowAccount
        const qty = `${size === null ? i.quantity : size.toFixed(2)} ${i.price_unit}`;
        return (
          <label key={i.id} className={`flex items-start gap-2 py-3 border-b border-border ${off ? "opacity-50" : ""}`}>
            {onToggle && (
              <input type="checkbox" checked={!off} disabled={noSize} onChange={() => onToggle(i.id)} className="mt-1.5 w-4 h-4 accent-[var(--primary)] shrink-0" />
            )}
            <span className="flex-1 min-w-0 space-y-0.5">
              <span className="flex justify-between gap-3 text-base">
                <span className="font-medium">{i.name}</span>
                <span className="font-mono font-semibold whitespace-nowrap">{noSize ? "–" : baht(lineTotal(i, i.price_unit))}</span>
              </span>
              {noSize && (
                <span className="block text-sm text-amber-800">
                  ยังไม่มีขนาด{" "}
                  <Link href={`/liff/catalog/${i.product_id}/measure`} className="font-semibold underline">กรอกขนาด</Link>
                  {" "}แล้วลบรายการนี้ทิ้ง
                </span>
              )}
              {/* ที่มาของจำนวน: ผ้าม่าน = กว้าง × สูง × บาน / หน่วยเมตร = กว้าง × บาน */}
              {size !== null && !noSize && (
                <span className="block text-sm text-muted-foreground">
                  {isAreaUnit(i.price_unit)
                    ? `กว้าง ${i.width} × สูง ${i.height} ม. × ${i.quantity} หน้าต่าง = ${qty}`
                    : `กว้าง ${i.width} ม. × ${i.quantity} หน้าต่าง = ${qty}`}
                </span>
              )}
              <span className="block text-sm text-muted-foreground">
                {qty} × {baht(i.unit_price)} / {i.price_unit}
              </span>
            </span>
            {/* ปุ่มลบ: เอาออกจากตะกร้าเลย / preventDefault กันกดแล้วไปติ๊กช่องเลือกของแถวนี้ (ปุ่มอยู่ใน label) */}
            {onRemove && (
              <button type="button" aria-label={`ลบ ${i.name}`}
                onClick={(e) => { e.preventDefault(); if (confirm(`ลบ "${i.name}" ออกจากใบสรุปราคา?`)) onRemove(i.id); }}
                className="-mr-1 shrink-0 rounded-lg p-1.5 text-stone-400 active:text-red-600">
                <Trash2 size={18} />
              </button>
            )}
          </label>
        );
      })}
    </div>
  );
}

// ตัวเลือกจำนวนห้อง  [ − ] 2 [ + ]  กดปุ่มหรือพิมพ์เองก็ได้
function RoomStepper({ value, onChange, error }: { value: string; onChange: (v: string) => void; error: string }) {
  const n = Number(value) || 0;
  const set = (x: number) => onChange(String(Math.min(MAX_ROOMS, Math.max(1, x))));
  return (
    <div className={`flex items-center rounded-xl border bg-card ${error ? "border-red-400" : "border-border"}`}>
      <button type="button" onClick={() => set(n - 1)} disabled={n <= 1} aria-label="ลดจำนวนห้อง"
        className="px-3 py-1.5 text-lg disabled:text-muted-foreground/40">−</button>
      <input type="text" inputMode="numeric" maxLength={2} value={value} aria-label="จำนวนห้องที่ติดเหมือนกัน" aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="w-8 bg-transparent text-center text-base font-semibold outline-none" />
      <button type="button" onClick={() => set(n + 1)} disabled={n >= MAX_ROOMS} aria-label="เพิ่มจำนวนห้อง"
        className="px-3 py-1.5 text-lg disabled:text-muted-foreground/40">+</button>
    </div>
  );
}

// ยอดรวม: ราคาต่อห้อง → ติดเหมือนกันกี่ห้อง → ยอดรวมสินค้า / VAT / รวมทั้งสิ้น
//   ส่ง roomInput = แก้จำนวนห้องได้ (ขั้นสรุปราคา) / ไม่ส่ง = แสดงอย่างเดียว (ใบประเมินราคา โชว์เฉพาะเมื่อมากกว่า 1 ห้อง)
function Totals({ rooms, roomSubTotal, subTotal, vat, total, roomInput, roomError }: {
  rooms: number; roomSubTotal: number; subTotal: number; vat: number; total: number;
  roomInput?: React.ReactNode; roomError?: string;
}) {
  const showRooms = Boolean(roomInput) || rooms > 1;
  return (
    <div className="space-y-1.5 text-base">
      {showRooms && (
        <div className="space-y-1.5 border-b border-border pb-2">
          <div className="flex justify-between text-muted-foreground">
            <span>ราคาต่อห้อง</span><span className="font-mono">{baht(roomSubTotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-muted-foreground">
            <span>ติดเหมือนกัน</span>
            <span className="flex items-center gap-2">
              {roomInput ?? <span className="font-mono">{rooms}</span>} ห้อง
            </span>
          </div>
          {roomError && <p className="text-sm text-red-600" role="alert">{roomError}</p>}
        </div>
      )}
      <div className="flex justify-between text-muted-foreground"><span>ยอดรวมสินค้า</span><span className="font-mono">{baht(subTotal)}</span></div>
      <div className="flex justify-between text-muted-foreground"><span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span><span className="font-mono">{baht(vat)}</span></div>
      <div className="flex justify-between items-baseline border-t-2 border-foreground/80 pt-2">
        <span className="text-lg font-bold">รวมทั้งสิ้น / Total</span>
        <span className="text-2xl font-bold font-mono text-primary">{baht(total)}</span>
      </div>
    </div>
  );
}

function Remarks() {
  return (
    <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
      <li>เป็นราคาประเมิน ร้านจะวัดขนาดหน้างานจริงก่อนออกใบเสนอราคา</li>
      <li>ชำระมัดจำ 50% ก่อนติดตั้ง ส่วนที่เหลือชำระหลังติดตั้งเสร็จ</li>
    </ul>
  );
}
