"use client";
// ชำระเงินใบแจ้งหนี้ 1 ใบ ตาม Use Case 9
//   ข้อ 3 แสดงยอดและช่องทาง -> ข้อ 4 เลือก QR / เงินสด
//   A1.1 แสดง QR + เวลาที่เหลือ, A1.3 ถามสถานะซ้ำทุก 3 วินาที, A1.3.1 หมดอายุ = ขอ QR ใหม่
//   A2 เงินสด = แจ้งให้ชำระกับเจ้าหน้าที่ แล้วรอแอดมินบันทึก
//   ข้อ 6 ชำระสำเร็จ
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, CheckCircle2, Clock, QrCode, RefreshCw } from "lucide-react";
import { baht, thDate } from "@/components/admin/ui";
import { useApi, useLiffData } from "@/components/liff/LiffProvider";
import { invoiceLabel, PageTitle, Panel } from "@/components/liff/ui";

type Invoice = { invoice_id: number; type: string; amount: string; due_date: string; flowaccount_serial: string | null; qt_serial: string | null; total_amount: string; is_paid: boolean; pending_payment_id: number | null };
type Qr = { payment_id: number; status: string; qr_image?: string; expires_at?: string; amount: number };
type Step = "choose" | "qr" | "expired" | "cash" | "paid";

export default function PayInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const { data, error } = useLiffData<{ invoice: Invoice }>(`/api/liff/invoices/${id}`);
  const [step, setStep] = useState<Step>("choose");
  const [qr, setQr] = useState<Qr | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const invoice = data?.invoice;

  // เปิดหน้ามาตอนที่มี QR ค้างอยู่ = แสดง QR เดิมต่อ, ชำระแล้ว = แสดงหน้าสำเร็จ
  useEffect(() => {
    if (!invoice) return;
    if (invoice.is_paid) setStep("paid");
    else if (invoice.pending_payment_id) {
      api<Qr>(`/api/liff/payments/${invoice.pending_payment_id}`).then((p) => {
        if (p.status === "pending") { setQr(p); setStep("qr"); }
      }).catch(() => {});
    }
  }, [invoice, api]);

  async function requestQr() {
    setBusy(true); setMsg(null);
    try {
      const p = await api<Omit<Qr, "status">>("/api/liff/payments", { method: "POST", body: JSON.stringify({ invoice_id: Number(id) }) });
      setQr({ ...p, status: "pending" });
      setStep("qr");
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  // A1.3 ระบบตรวจสอบการชำระเงินโดยอัตโนมัติ
  const poll = useCallback(async () => {
    if (!qr) return;
    const p = await api<Qr>(`/api/liff/payments/${qr.payment_id}`).catch(() => null);
    if (p?.status === "paid") setStep("paid");
    else if (p && p.status !== "pending") setStep(p.status === "expired" ? "expired" : "choose");
  }, [api, qr]);

  useEffect(() => {
    if (step !== "qr") return;
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [step, poll]);

  // เงินสด: รอแอดมินบันทึก แล้วหน้านี้เปลี่ยนเป็นสำเร็จเอง
  useEffect(() => {
    if (step !== "cash") return;
    const t = setInterval(() => {
      api<{ invoice: Invoice }>(`/api/liff/invoices/${id}`).then((d) => d.invoice.is_paid && setStep("paid")).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [step, api, id]);

  if (error) return <><PageTitle title="ชำระเงิน" back="/liff/payments" /><Panel className="text-red-700 text-base">{error}</Panel></>;
  if (!invoice) return <Panel className="text-center text-muted-foreground">กำลังโหลด...</Panel>;

  return (
    <>
      <PageTitle title={`ชำระ${invoiceLabel(invoice.type)}`} back="/liff/payments" sub={`ใบเสนอราคา ${invoice.qt_serial ?? "-"}`} />

      {/* ข้อ 3: ยอดที่ต้องชำระ */}
      <Panel className="text-center space-y-1">
        <p className="text-base text-muted-foreground">ยอดที่ต้องชำระ</p>
        <p className="text-4xl font-bold font-mono text-primary">{baht(invoice.amount)}</p>
        <p className="text-sm text-muted-foreground">
          ใบแจ้งหนี้ {invoice.flowaccount_serial ?? `#${invoice.invoice_id}`} · ครบกำหนด {thDate(invoice.due_date)}
        </p>
      </Panel>

      {msg && <Panel className="text-red-700 text-base">{msg}</Panel>}

      {step === "choose" && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">เลือกช่องทางการชำระเงิน</h2>
          <MethodButton icon={QrCode} title="QR พร้อมเพย์" sub="สแกนจ่ายด้วยแอปธนาคาร ระบบยืนยันให้อัตโนมัติ" onClick={requestQr} disabled={busy} />
          <MethodButton icon={Banknote} title="เงินสด" sub="ชำระกับเจ้าหน้าที่ของร้าน" onClick={() => setStep("cash")} disabled={busy} />
          {busy && <p className="text-center text-base text-muted-foreground">กำลังสร้าง QR Code...</p>}
        </section>
      )}

      {step === "qr" && qr && (
        <Panel className="space-y-4 text-center">
          <p className="text-lg font-semibold">สแกน QR เพื่อชำระเงิน</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- รูป QR จาก Stripe ไม่ต้อง optimize */}
          {qr.qr_image && <img src={qr.qr_image} alt="QR พร้อมเพย์" className="w-64 h-64 mx-auto rounded-xl border border-border" />}
          {qr.expires_at && <Countdown until={qr.expires_at} onEnd={poll} />}
          <p className="text-base text-muted-foreground">
            เปิดแอปธนาคาร เลือก “สแกน” แล้วชำระยอด <b className="text-foreground">{baht(qr.amount)}</b><br />
            ชำระแล้วหน้านี้จะเปลี่ยนให้อัตโนมัติ
          </p>
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw size={14} className="animate-spin" /> กำลังรอการชำระเงิน</p>
          <button onClick={() => setStep("choose")} className="text-base text-muted-foreground underline">เปลี่ยนช่องทางการชำระ</button>
        </Panel>
      )}

      {step === "expired" && (
        <Panel className="space-y-4 text-center">
          <Clock size={48} className="mx-auto text-amber-600" />
          <p className="text-xl font-semibold">QR Code หมดอายุแล้ว</p>
          <p className="text-base text-muted-foreground">กรุณาขอ QR Code ใหม่เพื่อชำระเงินต่อ</p>
          <button onClick={requestQr} disabled={busy}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 text-lg font-semibold disabled:opacity-50">
            {busy ? "กำลังสร้าง..." : "ขอ QR Code ใหม่"}
          </button>
        </Panel>
      )}

      {step === "cash" && (
        <Panel className="space-y-4 text-center">
          <Banknote size={48} className="mx-auto text-emerald-600" />
          <p className="text-xl font-semibold">ชำระด้วยเงินสด</p>
          <p className="text-base text-muted-foreground">
            กรุณาชำระ <b className="text-foreground">{baht(invoice.amount)}</b> กับเจ้าหน้าที่ของร้าน<br />
            เมื่อเจ้าหน้าที่บันทึกรับเงินแล้ว สถานะจะเปลี่ยนเป็น “ชำระแล้ว” และร้านจะแจ้งทาง LINE
          </p>
          <button onClick={() => setStep("choose")} className="text-base text-muted-foreground underline">เปลี่ยนช่องทางการชำระ</button>
        </Panel>
      )}

      {step === "paid" && (
        <Panel className="space-y-4 text-center border-2 border-emerald-200 bg-emerald-50">
          <CheckCircle2 size={56} className="mx-auto text-emerald-600" />
          <p className="text-2xl font-bold text-emerald-800">ชำระเงินเรียบร้อย</p>
          <p className="text-base text-emerald-900">
            {invoice.type === "deposit"
              ? "ร้านได้รับค่ามัดจำแล้ว เจ้าหน้าที่จะติดต่อนัดวันติดตั้ง"
              : "ร้านได้รับยอดคงเหลือแล้ว ขอบคุณที่ใช้บริการ"}
          </p>
          <Link href="/liff/payments" className="block w-full bg-emerald-600 text-white rounded-xl py-4 text-lg font-semibold">
            ดูประวัติการชำระเงิน
          </Link>
        </Panel>
      )}
    </>
  );
}

function MethodButton({ icon: Icon, title, sub, onClick, disabled }: {
  icon: React.ElementType; title: string; sub: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full bg-card border-2 border-border rounded-2xl p-4 flex items-center gap-4 text-left active:border-primary disabled:opacity-50">
      <span className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon size={28} /></span>
      <span>
        <span className="block text-lg font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}

function Countdown({ until, onEnd }: { until: string; onEnd: () => void }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const l = new Date(until).getTime() - Date.now();
      setLeft(l);
      if (l <= 0) { clearInterval(t); onEnd(); }
    }, 1000);
    return () => clearInterval(t);
  }, [until, onEnd]);
  const s = Math.max(0, Math.floor(left / 1000));
  return (
    <p className={`text-lg font-mono font-semibold ${s < 60 ? "text-red-600" : "text-foreground"}`}>
      QR หมดอายุใน {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </p>
  );
}
