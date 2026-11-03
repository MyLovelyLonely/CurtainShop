"use client";
// แถบหัวของหน้าแอดมิน: ชื่อหน้าปัจจุบัน (ซ้าย) / กระดิ่งแจ้งเตือน + รูปแอดมิน (ขวา)
import { usePathname } from "next/navigation";
import { NAV } from "./Sidebar";
import { NotificationBell } from "./NotificationBell";

export function TopBar({ avatar }: { avatar: React.ReactNode }) {
  const path = usePathname();
  // ชื่อหน้า = เมนูที่ path ตรงกันยาวที่สุด เช่น /admin/quotations/22 -> ใบเสนอราคา
  const current = NAV.filter((n) => path === n.href || path.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <header className="h-16 shrink-0 bg-card border-b border-border px-6 flex items-center justify-between print:hidden">
      <p className="text-base font-semibold">{current?.label ?? ""}</p>
      <div className="flex items-center gap-3">
        <NotificationBell />
        {avatar}
      </div>
    </header>
  );
}
