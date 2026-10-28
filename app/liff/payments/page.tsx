"use client";
// ชำระเงิน: รายการที่ต้องชำระ (Use Case 9 ข้อ 1) + ประวัติการชำระเงิน (Use Case 10)
import Link from "next/link";
import { CalendarDays, ChevronRight, ReceiptText } from "lucide-react";
import { baht, thDate } from "@/components/admin/ui";
import { useLiffData } from "@/components/liff/LiffProvider";
import { invoiceLabel, PageTitle, Panel } from "@/components/liff/ui";

type ToPay = { invoice_id: number; type: string; amount: string; due_date: string; flowaccount_serial: string | null; qt_serial: string | null; project_name: string | null };
type History = { payment_id: number; type: string; amount: string; pay_method: string; paid_at: string; inv_serial: string | null; receipt_serial: string | null; tax_serial: string | null };

export default function LiffPayments() {
  const { data, error } = useLiffData<{ to_pay: ToPay[]; history: History[] }>("/api/liff/invoices");

  return (
    <>
      <PageTitle title="ชำระเงิน" />
      {error && <Panel className="text-red-700 text-base">{error}</Panel>}
      {!data && !error && <Panel className="text-center text-muted-foreground">กำลังโหลด...</Panel>}

      {data && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">รายการที่ต้องชำระ</h2>
            {!data.to_pay.length && <Panel className="text-center text-base text-muted-foreground py-8">ไม่มีรายการที่ต้องชำระ</Panel>}
            {data.to_pay.map((i) => (
              <Link key={i.invoice_id} href={`/liff/payments/${i.invoice_id}`}>
                <Panel className="border-2 border-amber-200 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-lg font-semibold">{invoiceLabel(i.type)}</p>
                      <p className="text-sm text-muted-foreground">ใบเสนอราคา {i.qt_serial ?? "-"}{i.project_name ? ` · ${i.project_name}` : ""}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">รอชำระ</span>
                  </div>
                  <p className="text-3xl font-bold font-mono">{baht(i.amount)}</p>
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-base text-muted-foreground"><CalendarDays size={16} /> ครบกำหนด {thDate(i.due_date)}</p>
                    <span className="flex items-center gap-1 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-base font-semibold">
                      ชำระเงิน <ChevronRight size={18} />
                    </span>
                  </div>
                </Panel>
              </Link>
            ))}
          </section>

          <section className="space-y-3 pt-2">
            <h2 className="text-lg font-semibold">ประวัติการชำระเงิน</h2>
            {!data.history.length && <Panel className="text-center text-base text-muted-foreground py-8">ยังไม่มีประวัติการชำระเงิน</Panel>}
            {data.history.map((p) => (
              <Panel key={p.payment_id} className="space-y-1">
                <div className="flex justify-between items-baseline">
                  <p className="text-base font-semibold">{invoiceLabel(p.type)}</p>
                  <p className="text-lg font-bold font-mono text-emerald-700">{baht(p.amount)}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {thDate(p.paid_at, true)} · {p.pay_method === "cash" ? "เงินสด" : "QR พร้อมเพย์"}
                </p>
                <p className="flex items-center gap-1.5 text-sm">
                  <ReceiptText size={15} className="text-muted-foreground" />
                  {p.receipt_serial ? `ใบเสร็จ ${p.receipt_serial}` : "ร้านกำลังออกใบเสร็จ"}
                  {p.tax_serial && ` · ใบกำกับภาษี ${p.tax_serial}`}
                </p>
              </Panel>
            ))}
          </section>
        </>
      )}
    </>
  );
}
