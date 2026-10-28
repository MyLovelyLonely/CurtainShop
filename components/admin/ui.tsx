// ชิ้นส่วน UI ที่ใช้ซ้ำในหลังบ้าน
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export const baht = (n: number | string | null | undefined) =>
  `฿${Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const thDate = (d: string | Date | null | undefined, withTime = false) =>
  d
    ? new Date(d).toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "short",
        year: "2-digit",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : "-";

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold font-serif">{title}</h2>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, children, className = "", size = "sm" }: {
  title?: string; children: React.ReactNode; className?: string; size?: "sm" | "lg";
}) {
  return (
    <div className={`bg-card border border-border rounded-xl overflow-hidden ${className}`}>
      {title && <p className={`${size === "lg" ? "text-lg px-5 pt-5 pb-3" : "text-sm px-4 pt-4 pb-2"} font-semibold`}>{title}</p>}
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: LucideIcon; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center shrink-0`}>
        <Icon size={17} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold font-mono">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

const BADGE_COLORS = {
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  gray: "bg-muted text-muted-foreground border-border",
  red: "bg-red-50 text-red-700 border-red-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
};

export function Badge({ children, color = "gray", size = "sm" }: {
  children: React.ReactNode; color?: keyof typeof BADGE_COLORS; size?: "sm" | "lg";
}) {
  const sizing = size === "lg" ? "text-sm px-3 py-1" : "text-[11px] px-2 py-0.5";
  return <span className={`${sizing} rounded-full border font-medium whitespace-nowrap ${BADGE_COLORS[color]}`}>{children}</span>;
}

// สถานะตาม Data Dictionary
export const JOB_STATUS: Record<string, [string, keyof typeof BADGE_COLORS]> = {
  pending: ["รอดำเนินการ", "amber"],
  in_progress: ["กำลังดำเนินการ", "blue"],
  completed: ["ดำเนินการเสร็จสิ้น", "emerald"],
  closed: ["ปิดงาน", "gray"],
};

export const PAYMENT_STATUS: Record<string, [string, keyof typeof BADGE_COLORS]> = {
  pending: ["รอชำระ", "amber"],
  paid: ["ชำระแล้ว", "emerald"],
  expired: ["QR หมดอายุ", "red"],
  cancelled: ["ยกเลิก", "gray"],
};

export function StatusBadge({ map, status, size }: {
  map: Record<string, [string, keyof typeof BADGE_COLORS]>; status: string; size?: "sm" | "lg";
}) {
  const [label, color] = map[status] ?? [status, "gray"];
  return <Badge color={color} size={size}>{label}</Badge>;
}

// แท็บกรองรายการแบบลิงก์ (?tab=...) ตัวใหญ่ กดง่าย ไม่ต้องใช้ JavaScript ฝั่ง client
// แท็บแรกคือค่าเริ่มต้นเมื่อเปิดหน้า (ไม่มี ?tab)
export function Tabs({ tabs, active, basePath }: {
  tabs: { key: string; label: string; count: number }[]; active: string; basePath: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t, i) => (
        <Link
          key={t.key}
          href={i === 0 ? basePath : `${basePath}?tab=${t.key}`}
          className={`px-4 py-2.5 rounded-xl text-base font-medium border transition-colors ${
            active === t.key
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-foreground border-border hover:bg-muted"
          }`}
        >
          {t.label} <span className={`ml-1 font-mono ${active === t.key ? "opacity-90" : "text-muted-foreground"}`}>({t.count})</span>
        </Link>
      ))}
    </div>
  );
}

// ปุ่มลิงก์ขนาดใหญ่ สำหรับคำสั่งหลักของแต่ละรายการ
export function ButtonLink({ href, children, variant = "primary" }: {
  href: string; children: React.ReactNode; variant?: "primary" | "outline";
}) {
  const style = variant === "primary"
    ? "bg-primary text-primary-foreground hover:opacity-90"
    : "border-2 border-primary text-primary hover:bg-primary/10";
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl text-base font-semibold whitespace-nowrap ${style}`}>
      {children}
    </Link>
  );
}

// ข้อความว่างพร้อมคำแนะนำ
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="bg-card border border-dashed border-border rounded-xl py-12 text-center text-base text-muted-foreground">{children}</div>;
}

// ตารางแบบง่าย: headers + rows
export function Table({ headers, children, empty, size = "sm" }: {
  headers: string[]; children: React.ReactNode; empty?: boolean; size?: "sm" | "lg";
}) {
  const lg = size === "lg";
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${lg ? "text-base" : "text-sm"}`}>
        <thead>
          <tr className={`bg-muted/50 border-b border-border ${lg ? "text-sm" : "text-xs"} text-muted-foreground text-left`}>
            {headers.map((h) => (
              <th key={h} className={`px-4 ${lg ? "py-3" : "py-2.5"} font-semibold whitespace-nowrap`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className={`[&>tr]:border-b [&>tr]:border-border [&>tr:last-child]:border-0 [&_td]:px-4 ${lg ? "[&_td]:py-4" : "[&_td]:py-3"}`}>
          {children}
        </tbody>
      </table>
      {empty && <p className={`text-center ${lg ? "text-base" : "text-sm"} text-muted-foreground py-8`}>ยังไม่มีข้อมูล</p>}
    </div>
  );
}
