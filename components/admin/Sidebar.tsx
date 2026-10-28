"use client";
// เมนูซ้ายของหลังบ้าน (ตาม Figma) เรียงตามลำดับงานของร้าน
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen, Calculator, ClipboardList, FileText, HelpCircle, LayoutDashboard, Receipt, Scissors, Wrench,
} from "lucide-react";

export const NAV = [
  { href: "/admin", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/admin/estimates", label: "ใบประเมินราคา", icon: Calculator },
  { href: "/admin/quotations", label: "ใบเสนอราคา", icon: FileText },
  { href: "/admin/invoices", label: "ออกบิล / ใบเสร็จ", icon: Receipt },
  { href: "/admin/jobs", label: "งานและสถานะงาน", icon: ClipboardList },
  { href: "/admin/technicians", label: "ช่างและตารางงาน", icon: Wrench },
  { href: "/admin/catalog", label: "Catalog", icon: BookOpen },
  { href: "/admin/qna", label: "คำถาม-คำตอบ", icon: HelpCircle },
];

export function Sidebar() {
  const path = usePathname();
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
    </aside>
  );
}
