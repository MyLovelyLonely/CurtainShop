"use client";
// ใบประเมินราคาฝั่งลูกค้า (Use Case 4-5) โครงเดียวกับใบเสนอราคา แต่เป็นเอกสารในระบบ ไม่ส่งเข้า FlowAccount
//   ขั้น 1 สรุปราคา: ติ๊กเลือกรายการจากแคตตาล็อก -> "จัดทำใบประเมินราคา"
//   ขั้น 2 ใบประเมินราคา: ดูแบบเอกสาร -> "ส่งใบประเมินราคา" ให้แอดมิน / กด "แก้ไข" แก้ข้อมูลผู้ซื้อบนเอกสาร
//   ส่ง = POST /api/liff/estimates บันทึกลง price_estimate + price_estimate_item ข้อมูลลูกค้าที่แก้เก็บใน price_estimate.details.billing (ไม่แก้ข้อมูลของฉัน)
// ยังไม่เสร็จ:
//   - รายการสินค้ารอ API จากเพื่อน (ITEMS_API) ยังไม่มี = ใช้ SAMPLE_ITEMS
//   - ปุ่มบันทึกรูป / Export PDF ยังไม่ทำงาน
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2, ChevronLeft, Download, FileText, PencilLine, Send } from "lucide-react";
import { baht, thDate } from "@/components/admin/ui";
import { useApi, useLiffData } from "@/components/liff/LiffProvider";
import { Panel } from "@/components/liff/ui";
import { BuyerGrid, cleanEstimateBuyer, EstimateBuyerForm, estimateBuyerFrom, estimateBuyerMissing, type EstimateBuyer, type Me } from "@/components/liff/BuyerInfo";
import { lineArea, lineTotal } from "@/lib/pricing";
import { r2, VAT_RATE } from "@/lib/documents";

// รายการสินค้า หน้าตาเหมือน quotation_item (เพื่อนส่งมาจาก API แคตตาล็อก)
//   id = ลำดับในรายการ, product_id = สินค้าในตาราง product (ตอนส่ง เซิร์ฟเวอร์ดึงราคาจาก product เอง)
type Item = { id: number; product_id: number; name: string; price_unit: string; width: number | null; height: number | null; quantity: number; unit_price: number };

// TODO: เปลี่ยนเป็น path จริงเมื่อเพื่อนทำ API เสร็จ ต้องตอบ { items: Item[] }
const ITEMS_API = "/api/liff/estimate/items";

// ตัวอย่างใช้สินค้าที่มีอยู่จริงในตาราง product ส่งทดสอบได้ (ลบทิ้งเมื่อ API แคตตาล็อกพร้อม)
const SAMPLE_ITEMS: Item[] = [
  { id: 1, product_id: 1, name: "BK-101 ผ้าม่านกันแสงสีเทา", price_unit: "ตร.ม.", width: 3, height: 2.8, quantity: 1, unit_price: 1500 },
  { id: 2, product_id: 4, name: "SH-201 ผ้าม่านโปร่งสีขาว", price_unit: "ตร.ม.", width: 2.5, height: 2.6, quantity: 1, unit_price: 900 },
  { id: 3, product_id: 5, name: "RL-01 รางม่านอลูมิเนียม", price_unit: "ชุด", width: null, height: null, quantity: 2, unit_price: 1200 },
];

// ปุ่มรองให้เหมือนปุ่มเอกสารอื่น (components/liff/DocButton.tsx)
const SECONDARY = "w-full flex items-center justify-center gap-2 bg-card border-2 border-primary/60 text-primary shadow-sm rounded-xl py-2.5 text-base font-semibold active:bg-primary/10";

export default function LiffEstimate() {
  const api = useApi();
  const me = useLiffData<Me>("/api/liff/me");
  const [items, setItems] = useState<Item[] | null>(null);
  const [sample, setSample] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [edited, setEdited] = useState<EstimateBuyer | null>(null);
  const [step, setStep] = useState<"summary" | "document">("summary");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sentId, setSentId] = useState<number | null>(null); // ส่งแล้ว = estimate_id

  // รายการสินค้า: API ยังไม่พร้อม = ใช้ข้อมูลตัวอย่าง
  useEffect(() => {
    const use = (list: Item[], isSample: boolean) => {
      setItems(list); setSample(isSample); setPicked(new Set(list.map((i) => i.id)));
    };
    api<{ items: Item[] }>(ITEMS_API).then((d) => use(d.items, false), () => use(SAMPLE_ITEMS, true));
  }, [api]);

  // ข้อมูลผู้ซื้อ: ยังไม่แก้ = เติมจากโปรไฟล์ไว้ก่อน ลูกค้าแก้ / ลบเองได้ในโหมดแก้ไข
  const billing = edited ?? (me.data ? estimateBuyerFrom(me.data) : null);

  if (me.error) return <Panel className="text-red-700 text-base">{me.error}</Panel>;
  if (!items || !billing) return <Panel className="text-center text-muted-foreground">กำลังโหลด...</Panel>;

  const selected = items.filter((i) => picked.has(i.id));
  const subTotal = r2(selected.reduce((s, i) => s + lineTotal(i, i.price_unit), 0));
  const vat = r2(subTotal * VAT_RATE);
  const total = r2(subTotal + vat);

  const toggle = (id: number) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ช่องที่ต้องกรอก (ยังไม่ครบ = ส่งไม่ได้ บอกว่าขาดอะไร)
  const missing = estimateBuyerMissing(billing);
  const buyer = cleanEstimateBuyer(billing); // แสดงบนเอกสาร + ส่งไปบันทึก (price_estimate.details.billing)

  async function send() {
    setBusy(true); setMsg(null);
    try {
      const res = await api<{ estimate: { estimate_id: number } }>("/api/liff/estimates", {
        method: "POST",
        body: JSON.stringify({
          items: selected.map((i) => ({ product_id: i.product_id, width: i.width, height: i.height, quantity: i.quantity })),
          billing: buyer,
        }),
      });
      setSentId(res.estimate.estimate_id);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  // ---------- ขั้น 1 สรุปราคา ----------
  if (step === "summary") {
    return (
      <>
        <Header title="สรุปราคา" back={<Link href="/liff/catalog" aria-label="ย้อนกลับ" className="-ml-2 p-2 text-muted-foreground"><ChevronLeft size={26} /></Link>} />
        {sample && <SampleNote />}
        <Panel className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-bold">ข้อมูลลูกค้า</p>
            <EditToggle editing={editing} onChange={setEditing} />
          </div>
          {editing ? <EstimateBuyerForm value={billing} onChange={setEdited} /> : <BuyerGrid buyer={buyer} />}
          <ItemTable items={items} picked={picked} onToggle={toggle} />
          <Totals subTotal={subTotal} vat={vat} total={total} />
          <Remarks />
        </Panel>
        <button onClick={() => { setStep("document"); setEditing(false); }} disabled={!selected.length}
          className="w-full bg-primary text-primary-foreground rounded-xl py-4 text-lg font-semibold disabled:opacity-50">
          จัดทำใบประเมินราคา
        </button>
      </>
    );
  }

  // ---------- ขั้น 2 ใบประเมินราคา ----------
  return (
    <>
      <Header title="ใบประเมินราคา"
        back={<button onClick={() => setStep("summary")} aria-label="ย้อนกลับ" className="-ml-2 p-2 text-muted-foreground"><ChevronLeft size={26} /></button>}
        action={sentId ? null : <EditToggle editing={editing} onChange={setEditing} />} />
      {sample && <SampleNote />}

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
          <ItemTable items={selected} />
          <Totals subTotal={subTotal} vat={vat} total={total} />
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
        <button type="button" onClick={send} disabled={busy || Boolean(missing)}
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

function SampleNote() {
  return <p className="text-sm text-center text-muted-foreground"></p>;
}

// ตารางรายการ: ส่ง onToggle = มีช่องติ๊กเลือก (ขั้นสรุปราคา)
function ItemTable({ items, picked, onToggle }: { items: Item[]; picked?: Set<number>; onToggle?: (id: number) => void }) {
  return (
    <div className="border-t border-border">
      <div className="flex justify-between gap-3 py-2 text-sm text-muted-foreground border-b border-border">
        <span>รายการ</span><span>รวม (฿)</span>
      </div>
      {items.map((i) => {
        const area = lineArea(i, i.price_unit);
        const off = picked && !picked.has(i.id);
        // จำนวนที่คิดเงิน + หน่วย แบบคอลัมน์ "จำนวน / หน่วย / ราคาต่อหน่วย" ของ FlowAccount
        const qty = `${area === null ? i.quantity : area.toFixed(2)} ${i.price_unit}`;
        return (
          <label key={i.id} className={`flex items-start gap-2 py-3 border-b border-border ${off ? "opacity-50" : ""}`}>
            {onToggle && (
              <input type="checkbox" checked={!off} onChange={() => onToggle(i.id)} className="mt-1.5 w-4 h-4 accent-[var(--primary)] shrink-0" />
            )}
            <span className="flex-1 min-w-0 space-y-0.5">
              <span className="flex justify-between gap-3 text-base">
                <span className="font-medium">{i.name}</span>
                <span className="font-mono font-semibold whitespace-nowrap">{baht(lineTotal(i, i.price_unit))}</span>
              </span>
              {/* ผ้าม่าน: ที่มาของ ตร.ม. (กว้าง × สูง × จำนวนหน้าต่าง) */}
              {area !== null && (
                <span className="block text-sm text-muted-foreground">
                  กว้าง {i.width} × สูง {i.height} ม. × {i.quantity} หน้าต่าง = {qty}
                </span>
              )}
              <span className="block text-sm text-muted-foreground">
                {qty} × {baht(i.unit_price)} / {i.price_unit}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function Totals({ subTotal, vat, total }: { subTotal: number; vat: number; total: number }) {
  return (
    <div className="space-y-1.5 text-base">
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
