"use client";
// หน้าหลักลูกค้า: ทักทาย + ทางลัดไปเมนูต่าง ๆ + แจ้งยอดที่ต้องชำระ
import Link from "next/link";
import { BookOpen, ChevronRight, ClipboardList, FileText, Wallet } from "lucide-react";
import { baht } from "@/components/admin/ui";
import { useLiffData } from "@/components/liff/LiffProvider";
import { Panel } from "@/components/liff/ui";

type Me = { customer: { display_name: string; full_name: string | null } };
type Invoices = { to_pay: { amount: string }[] };

export default function LiffHome() {
  const me = useLiffData<Me>("/api/liff/me");
  const inv = useLiffData<Invoices>("/api/liff/invoices");
  const toPay = inv.data?.to_pay ?? [];

  return (
    <>
      <div>
        <p className="text-base text-muted-foreground">สวัสดีค่ะ</p>
        <h1 className="text-2xl font-bold">คุณ{me.data?.customer.full_name ?? me.data?.customer.display_name ?? "..."}</h1>
      </div>

      {toPay.length > 0 && (
        <Link href="/liff/payments" className="block bg-amber-50 border-2 border-amber-300 rounded-2xl p-4">
          <p className="text-base text-amber-800">มีรายการรอชำระ {toPay.length} รายการ</p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold font-mono text-amber-900">{baht(toPay.reduce((s, i) => s + Number(i.amount), 0))}</p>
            <span className="flex items-center text-base font-semibold text-amber-900">ชำระเงิน <ChevronRight size={20} /></span>
          </div>
        </Link>
      )}

      <div className="grid gap-3">
        {[
          { href: "/liff/catalog", icon: BookOpen, title: "แคตตาล็อกผ้าม่าน", sub: "ค้นหาลายผ้า และประเมินราคา" },
          { href: "/liff/documents", icon: FileText, title: "เอกสารของฉัน", sub: "ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ" },
          { href: "/liff/jobs", icon: ClipboardList, title: "สถานะงาน", sub: "ติดตามขั้นตอนการติดตั้ง" },
          { href: "/liff/payments", icon: Wallet, title: "ชำระเงิน", sub: "ชำระด้วย QR พร้อมเพย์ หรือเงินสด" },
        ].map(({ href, icon: Icon, title, sub }) => (
          <Link key={href} href={href}>
            <Panel className="flex items-center gap-4">
              <span className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon size={24} /></span>
              <div className="flex-1">
                <p className="text-lg font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{sub}</p>
              </div>
              <ChevronRight className="text-muted-foreground" />
            </Panel>
          </Link>
        ))}
      </div>
    </>
  );
}
