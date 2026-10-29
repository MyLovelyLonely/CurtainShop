"use client";
// เอกสารของฉัน แยกตามประเภท (Use Case 8, ขอบเขต 1.3.3.3)
//   ใบเสนอราคา: ตรวจสอบ + ยืนยัน, ใบแจ้งหนี้: ไปชำระเงิน, ใบกำกับภาษี / ใบเสร็จ: ดูเอกสาร
//   ใบสัญญาซื้อขาย: ยังไม่เปิดให้ส่งไฟล์ (หน้าเปล่าไว้ก่อน)
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { baht, thDate } from "@/components/admin/ui";
import { useLiffData } from "@/components/liff/LiffProvider";
import { DocButton } from "@/components/liff/DocButton";
import { Empty, invoiceLabel, PageTitle, Panel, Tag } from "@/components/liff/ui";

type Quotation = { quotation_id: number; serial: string | null; record_id: string | null; total_amount: string; created_at: string; confirmed_at: string | null; project_name: string | null; room_count: number };
type Invoice = { invoice_id: number; type: string; amount: string; due_date: string; flowaccount_serial: string | null; qt_serial: string | null; is_paid: boolean; flowaccount_record_id?: string | null };
type Paper = { serial: string | null; record_id: string | null; created_at: string; amount: string; type: string; qt_serial: string | null };
type Contract = { contract_id: number; created_at: string; signed_file_url: string | null; signed_at: string | null; qt_serial: string | null };
type Docs = { quotations: Quotation[]; invoices: Invoice[]; tax_invoices: (Paper & { tax_invoice_id: number })[]; receipts: (Paper & { receipt_id: number })[]; contracts: Contract[] };

const TABS = [
  { key: "quotations", label: "ใบเสนอราคา" },
  { key: "invoices", label: "ใบแจ้งหนี้" },
  { key: "tax", label: "ใบกำกับภาษี" },
  { key: "receipts", label: "ใบเสร็จ" },
  { key: "contracts", label: "สัญญา" },
] as const;

export default function LiffDocuments() {
  const { data, error } = useLiffData<Docs>("/api/liff/documents");
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = TABS.find((t) => t.key === params.get("type"))?.key ?? "quotations";

  const count = (key: string) => data ? {
    quotations: data.quotations.length, invoices: data.invoices.length, tax: data.tax_invoices.length,
    receipts: data.receipts.length, contracts: data.contracts.length,
  }[key] : undefined;

  return (
    <>
      <PageTitle title="เอกสารของฉัน" />

      {/* แท็บประเภทเอกสาร เลื่อนซ้ายขวาได้ */}
      <div className="-mx-4 px-4 overflow-x-auto">
        <div className="flex gap-2 w-max">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => router.replace(`${path}?type=${t.key}`, { scroll: false })}
              className={`px-4 py-2 rounded-full text-base font-medium border-2 whitespace-nowrap ${
                tab === t.key ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border text-muted-foreground"}`}>
              {t.label}{count(t.key) ? ` (${count(t.key)})` : ""}
            </button>
          ))}
        </div>
      </div>

      {error && <Panel className="text-red-700 text-base">{error}</Panel>}
      {!data && !error && <Panel className="text-center text-muted-foreground">กำลังโหลด...</Panel>}

      {data && tab === "quotations" && (
        <section className="space-y-3">
          {!data.quotations.length && <Empty>ยังไม่มีใบเสนอราคา</Empty>}
          {data.quotations.map((q) => (
            <Panel key={q.quotation_id} className={`space-y-3 ${q.confirmed_at ? "" : "border-2 border-amber-300"}`}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="text-lg font-semibold">ใบเสนอราคา {q.serial ?? `#${q.quotation_id}`}</p>
                  <p className="text-sm text-muted-foreground">
                    {thDate(q.created_at)}{q.room_count > 1 ? ` · ${q.room_count} ห้อง` : ""}{q.project_name ? ` · ${q.project_name}` : ""}
                  </p>
                </div>
                {q.confirmed_at ? <Tag tone="emerald">ยืนยันแล้ว</Tag> : <Tag tone="amber">รอยืนยัน</Tag>}
              </div>
              <p className="text-2xl font-bold font-mono">{baht(q.total_amount)}</p>
              <Link href={`/liff/documents/quotations/${q.quotation_id}`}
                className={`flex items-center justify-center gap-1 rounded-xl py-3 text-lg font-semibold ${
                  q.confirmed_at ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}>
                {q.confirmed_at ? "ดูรายละเอียด" : "ตรวจสอบและยืนยัน"} <ChevronRight size={20} />
              </Link>
            </Panel>
          ))}
        </section>
      )}

      {data && tab === "invoices" && (
        <section className="space-y-3">
          {!data.invoices.length && <Empty>ยังไม่มีใบแจ้งหนี้</Empty>}
          {data.invoices.map((i) => (
            <Panel key={i.invoice_id} className="space-y-3">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="text-lg font-semibold">ใบแจ้งหนี้{invoiceLabel(i.type)}</p>
                  <p className="text-sm text-muted-foreground">{i.flowaccount_serial ?? `#${i.invoice_id}`} · ใบเสนอราคา {i.qt_serial ?? "-"}</p>
                </div>
                {i.is_paid ? <Tag tone="emerald">ชำระแล้ว</Tag> : <Tag tone="amber">รอชำระ</Tag>}
              </div>
              <div className="flex justify-between items-baseline">
                <p className="text-2xl font-bold font-mono">{baht(i.amount)}</p>
                {!i.is_paid && <p className="text-sm text-muted-foreground">ครบกำหนด {thDate(i.due_date)}</p>}
              </div>
              {!i.is_paid && (
                <Link href={`/liff/payments/${i.invoice_id}`}
                  className="flex items-center justify-center gap-1 bg-primary text-primary-foreground rounded-xl py-3 text-lg font-semibold">
                  ชำระเงิน <ChevronRight size={20} />
                </Link>
              )}
              <DocButton docType="billing-notes" recordId={i.flowaccount_record_id ?? null} />
            </Panel>
          ))}
        </section>
      )}

      {data && tab === "tax" && (
        <PaperList rows={data.tax_invoices} docType="tax-invoices" title="ใบกำกับภาษี"
          empty="ยังไม่มีใบกำกับภาษี ร้านจะออกให้หลังได้รับชำระเงิน" />
      )}

      {data && tab === "receipts" && (
        <PaperList rows={data.receipts} docType="receipts" title="ใบเสร็จรับเงิน"
          empty="ยังไม่มีใบเสร็จ ร้านจะออกให้หลังได้รับชำระเงิน" />
      )}

      {data && tab === "contracts" && (
        <section className="space-y-3">
          <Panel className="space-y-3 text-base">
            <p className="text-lg font-semibold">ใบสัญญาซื้อขาย</p>
            <ol className="space-y-2 list-decimal pl-5 text-muted-foreground">
              <li>ร้านส่งใบสัญญาให้ตรวจสอบที่หน้านี้</li>
              <li>ดาวน์โหลด เซ็นชื่อ แล้วถ่ายรูปหรือสแกน</li>
              <li>ส่งไฟล์ที่เซ็นแล้วกลับมาที่หน้านี้ ร้านจะตรวจสอบอีกครั้ง</li>
            </ol>
            <p className="text-sm text-muted-foreground bg-muted rounded-xl px-3 py-2">การส่งไฟล์สัญญากำลังพัฒนา</p>
          </Panel>
          {data.contracts.map((c) => (
            <Panel key={c.contract_id} className="flex justify-between items-center gap-2">
              <div>
                <p className="text-base font-semibold">สัญญาของใบเสนอราคา {c.qt_serial ?? "-"}</p>
                <p className="text-sm text-muted-foreground">{thDate(c.created_at)}</p>
              </div>
              {c.signed_at ? <Tag tone="emerald">ร้านตรวจสอบแล้ว</Tag>
                : c.signed_file_url ? <Tag tone="blue">รอร้านตรวจสอบ</Tag>
                : <Tag tone="amber">รอเซ็น</Tag>}
            </Panel>
          ))}
        </section>
      )}
    </>
  );
}

function PaperList({ rows, docType, title, empty }: { rows: Paper[]; docType: string; title: string; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <section className="space-y-3">
      {rows.map((r) => (
        <Panel key={`${r.serial}-${r.record_id}`} className="space-y-3">
          <div className="flex justify-between items-start gap-2">
            <div>
              <p className="text-lg font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">{r.serial ?? "-"} · {invoiceLabel(r.type)} · {thDate(r.created_at)}</p>
            </div>
            <p className="text-lg font-bold font-mono">{baht(r.amount)}</p>
          </div>
          <DocButton docType={docType} recordId={r.record_id} />
        </Panel>
      ))}
    </section>
  );
}
