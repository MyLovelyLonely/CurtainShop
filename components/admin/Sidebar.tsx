"use client";
// เมนูซ้ายของหลังบ้าน (ตาม Figma) เรียงตามลำดับงานของร้าน
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen, Calculator, ClipboardList, FileSignature, FileText, HelpCircle, History, LayoutDashboard, LogOut, Receipt, Scissors, Wrench,
} from "lucide-react";

export const NAV = [
  { href: "/admin", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/admin/estimates", label: "ใบประเมินราคา", icon: Calculator },
  { href: "/admin/quotations", label: "ใบเสนอราคา", icon: FileText },
  { href: "/admin/contracts", label: "ใบสัญญาซื้อขาย", icon: FileSignature },
  { href: "/admin/invoices", label: "ออกบิล / ใบเสร็จ", icon: Receipt },
  { href: "/admin/jobs", label: "งานและสถานะงาน", icon: ClipboardList },
  { href: "/admin/order-history", label: "ประวัติการสั่งซื้อ", icon: History },
  { href: "/admin/technicians", label: "ช่างและตารางงาน", icon: Wrench },
  { href: "/admin/catalog", label: "Catalog", icon: BookOpen },
  { href: "/admin/qna", label: "คำถาม-คำตอบ", icon: HelpCircle },
];

export function Sidebar() {
  const path = usePathname();
  const [logoutNotice, setLogoutNotice] = useState(false);
  const isActive = (href: string) => (href === "/admin" ? path === href : path.startsWith(href));

  return (
    <aside className="w-56 shrink-0 bg-card border-r border-border flex flex-col">
      <div className="px-4 py-4 border-b border-border flex items-center gap-2.5">
        <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
          <Scissors size={15} className="text-white" />
        </div>
        <div>
          <p className="font-serif font-bold text-sm leading-tight">ร้านผ้าม่าน</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Admin Dashboard</p>
        </div>
      </div>
      <nav className="flex-1 px-2.5 py-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              isActive(href) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon size={15} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-border p-3 print:hidden">
        <button
          type="button"
          onClick={() => setLogoutNotice(true)}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-red-50 hover:text-red-700"
        >
          <LogOut size={15} />
          ออกจากระบบ
        </button>
      </div>
      {logoutNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="presentation"
          onClick={() => setLogoutNotice(false)}
        >
          <div
            role="status"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <LogOut size={18} />
            </div>
            <p className="font-semibold">ยังออกจากระบบไม่ได้</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              ปุ่มนี้เป็น UI ตัวอย่าง ยังไม่ได้เชื่อมระบบบัญชีผู้ดูแล
            </p>
            <button
              type="button"
              onClick={() => setLogoutNotice(false)}
              className="mt-5 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
