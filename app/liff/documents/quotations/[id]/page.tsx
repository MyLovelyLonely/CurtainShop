"use client";
// ตรวจสอบและยืนยันใบเสนอราคา (Activity Diagram 3-4, ขอบเขต 1.3.3.3)
//   ข้อมูลถูกต้อง = กดยืนยัน -> ร้านออกใบแจ้งหนี้มัดจำต่อ
//   ข้อมูลไม่ถูกต้อง = กดแจ้งแก้ไข ร้านจึงแก้ไขใบเสนอราคาได้ (Use Case 15 Alternate Flow)
import { use, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { baht, thDate } from "@/components/admin/ui";
import { useApi, useLiffData } from "@/components/liff/LiffProvider";
import { DocButton } from "@/components/liff/DocButton";
import { PageTitle, Panel, Tag } from "@/components/liff/ui";
import { lineArea, lineTotal } from "@/lib/pricing";

type Quotation = { quotation_id: number; serial: string | null; record_id: string | null; total_amount: string; deposit_amount: string; created_at: string; confirmed_at: string | null; project_name: string | null; room_count: number; change_request: { note: string; requested_at: string } | null };
type Item = { quotation_item_id: number; name: string; price_unit: string; width: string | null; height: string | null; quantity: number; unit_price: string };

export default function QuotationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const { data, error, reload } = useLiffData<{ quotation: Quotation; items: Item[] }>(`/api/liff/quotations/${id}`);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState("");

  async function requestChange() {
    setBusy(true); setMsg(null);
    try {
      await api(`/api/liff/quotations/${id}/request-change`, { method: "POST", body: JSON.stringify({ note }) });
      setReporting(false);
      reload();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  async function confirm() {
    setBusy(true); setMsg(null);
    try {
      await api(`/api/liff/quotations/${id}/confirm`, { method: "POST" });
      setAsking(false);
      reload();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  const back = "/liff/documents?type=quotations";
  if (error) return <><PageTitle title="ใบเสนอราคา" back={back} /><Panel className="text-red-700 text-base">{error}</Panel></>;
  if (!data) return <Panel className="text-center text-muted-foreground">กำลังโหลด...</Panel>;

  const { quotation: q, items } = data;
  const rooms = q.room_count || 1;
  const roomSubTotal = items.reduce((s, i) => s + lineTotal(i, i.price_unit), 0);
  const subTotal = Math.round(roomSubTotal * rooms * 100) / 100;
  const total = Number(q.total_amount);
  const deposit = Number(q.deposit_amount);

  return (
    <>
      <PageTitle title={`ใบเสนอราคา ${q.serial ?? `#${q.quotation_id}`}`} back={back}
        sub={`${thDate(q.created_at)}${q.project_name ? ` · ${q.project_name}` : ""}`} />

      {q.confirmed_at ? (
        <Panel className="flex items-center gap-3 border-2 border-emerald-200 bg-emerald-50">
          <CheckCircle2 size={32} className="text-emerald-600 shrink-0" />
          <div>
            <p className="text-lg font-semibold text-emerald-800">ยืนยันแล้ว</p>
            <p className="text-sm text-emerald-900">เมื่อ {thDate(q.confirmed_at, true)} · ร้านจะส่งใบแจ้งหนี้มัดจำให้</p>
          </div>
        </Panel>
      ) : (
        <Panel className="border-2 border-amber-300 bg-amber-50 text-base text-amber-900">
          กรุณาตรวจสอบรายการและขนาดด้านล่าง ถ้าถูกต้องกด <b>“ยืนยันใบเสนอราคา”</b> ท้ายหน้า
        </Panel>
      )}

      {/* รายการสินค้า (ราคาต่อ 1 ห้อง) */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">รายการสินค้า{rooms > 1 ? " (ต่อ 1 ห้อง)" : ""}</h2>
          {rooms > 1 && <Tag tone="blue">{rooms} ห้อง</Tag>}
        </div>
        {items.map((i) => {
          const area = lineArea(i, i.price_unit);
          return (
            <Panel key={i.quotation_item_id} className="space-y-1.5">
              <p className="text-base font-semibold">{i.name}</p>
              <p className="text-base text-muted-foreground">
                {area === null
                  ? `${i.quantity} ${i.price_unit} × ${baht(i.unit_price)}`
                  : `กว้าง ${Number(i.width)} × สูง ${Number(i.height)} ม. · ${i.quantity} หน้าต่าง (${area.toFixed(2)} ตร.ม. × ${baht(i.unit_price)})`}
              </p>
              <p className="text-right text-lg font-bold font-mono">{baht(lineTotal(i, i.price_unit))}</p>
            </Panel>
          );
        })}
      </section>

      {/* สรุปยอด */}
      <Panel className="space-y-2 text-base">
        {rooms > 1 && <Row label="รวมต่อ 1 ห้อง" value={baht(roomSubTotal)} />}
        {rooms > 1 && <Row label="จำนวนห้อง" value={`× ${rooms}`} />}
        <Row label="ยอดก่อน VAT" value={baht(subTotal)} />
        <Row label="VAT 7%" value={baht(total - subTotal)} />
        <div className="flex justify-between items-baseline border-t-2 border-border pt-3">
          <span className="text-lg font-semibold">รวมทั้งสิ้น</span>
          <span className="text-2xl font-bold font-mono text-primary">{baht(total)}</span>
        </div>
        <Row label="มัดจำ (ชำระก่อนติดตั้ง)" value={baht(deposit)} />
        <Row label="คงเหลือ (ชำระหลังติดตั้ง)" value={baht(total - deposit)} />
      </Panel>

      <DocButton docType="quotations" recordId={q.record_id} label="ดูใบเสนอราคา (PDF)" />

      {/* แจ้งแก้ไขแล้ว รอร้านแก้ = ยังยืนยันไม่ได้ */}
      {!q.confirmed_at && q.change_request && (
        <Panel className="space-y-1 border-2 border-amber-300 bg-amber-50 text-base text-amber-900">
          <p className="text-lg font-semibold">แจ้งแก้ไขแล้ว รอร้านแก้ไข</p>
          <p>“{q.change_request.note}”</p>
          <p className="text-sm">ร้านจะส่งใบเสนอราคาฉบับแก้ไขให้ตรวจสอบอีกครั้ง</p>
        </Panel>
      )}

      {!q.confirmed_at && !q.change_request && (
        <section className="space-y-3 pt-1">
          {msg && <Panel className="text-red-700 text-base">{msg}</Panel>}
          {!asking ? (
            <button onClick={() => setAsking(true)}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 text-lg font-semibold">
              ยืนยันใบเสนอราคา
            </button>
          ) : (
            <Panel className="space-y-3 border-2 border-primary">
              <p className="text-lg font-semibold text-center">ยืนยันใบเสนอราคานี้ ยอด {baht(total)} ?</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setAsking(false)} disabled={busy}
                  className="border-2 border-border rounded-xl py-3 text-lg font-semibold">ยกเลิก</button>
                <button onClick={confirm} disabled={busy}
                  className="bg-primary text-primary-foreground rounded-xl py-3 text-lg font-semibold disabled:opacity-50">
                  {busy ? "กำลังยืนยัน..." : "ยืนยัน"}
                </button>
              </div>
            </Panel>
          )}
          {!reporting ? (
            <button onClick={() => setReporting(true)}
              className="w-full border-2 border-border rounded-xl py-3 text-lg font-semibold">
              ข้อมูลไม่ถูกต้อง แจ้งแก้ไข
            </button>
          ) : (
            <Panel className="space-y-3 border-2 border-amber-300">
              <p className="text-lg font-semibold">ต้องแก้ไขอะไร?</p>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                placeholder="เช่น ห้องนอนกว้าง 2.2 เมตร ไม่ใช่ 2 เมตร"
                className="w-full border-2 border-border rounded-xl p-3 text-base" />
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setReporting(false)} disabled={busy}
                  className="border-2 border-border rounded-xl py-3 text-lg font-semibold">ยกเลิก</button>
                <button onClick={requestChange} disabled={busy || !note.trim()}
                  className="bg-primary text-primary-foreground rounded-xl py-3 text-lg font-semibold disabled:opacity-50">
                  {busy ? "กำลังส่ง..." : "ส่งให้ร้าน"}
                </button>
              </div>
            </Panel>
          )}
        </section>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
