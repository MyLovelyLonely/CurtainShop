"use client";
// เมนูล่างของหน้าลูกค้า (เปิดจาก Rich Menu แล้วสลับหน้าได้ในนี้)
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText, House, UserRound, Wallet } from "lucide-react";

const NAV = [
  { href: "/liff", label: "หน้าหลัก", icon: House },
  { href: "/liff/catalog", label: "แคตตาล็อก", icon: BookOpen },
  { href: "/liff/documents", label: "เอกสาร", icon: FileText },
  { href: "/liff/payments", label: "ชำระเงิน", icon: Wallet },
  { href: "/liff/profile", label: "ข้อมูลของฉัน", icon: UserRound },
];

export function BottomNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/liff" ? path === href : path.startsWith(href));

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-border z-10">
      <div className="max-w-md mx-auto grid grid-cols-5">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${active(href) ? "text-primary" : "text-muted-foreground"}`}>
            <Icon size={22} strokeWidth={active(href) ? 2.4 : 1.8} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
