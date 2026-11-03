// ชิ้นส่วน UI ฝั่งลูกค้า (มือถือ)
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageTitle({ title, back, sub }: { title: string; back?: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2">
      {back && (
        <Link href={back} aria-label="ย้อนกลับ" className="-ml-2 p-2 text-muted-foreground"><ChevronLeft size={26} /></Link>
      )}
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {sub && <p className="text-base text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-border rounded-2xl p-4 ${className}`}>{children}</div>;
}

export function ComingSoon({ title, useCase }: { title: string; useCase: string }) {
  return (
    <>
      <PageTitle title={title} />
      <Panel className="text-center py-12 text-base text-muted-foreground">
        กำลังพัฒนา<br /><span className="text-sm">({useCase})</span>
      </Panel>
    </>
  );
}

export const invoiceLabel = (type: string) => (type === "deposit" ? "ค่ามัดจำ" : "ยอดคงเหลือ");

// ป้ายสถานะเล็ก ๆ บนการ์ด
const TONE = {
  amber: "bg-amber-100 text-amber-800", emerald: "bg-emerald-100 text-emerald-800",
  blue: "bg-blue-100 text-blue-800", gray: "bg-muted text-muted-foreground",
} as const;
export function Tag({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return <span className={`text-sm px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${TONE[tone]}`}>{children}</span>;
}

// ข้อความเมื่อไม่มีรายการ
export function Empty({ children }: { children: React.ReactNode }) {
  return <Panel className="text-center text-base text-muted-foreground py-8">{children}</Panel>;
}

// แถบขั้นตอนเป็นขีด ๆ: ขั้นที่ผ่านแล้วสีเขียว ขั้นปัจจุบันสีทอง
export function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {steps.map((s, i) => (
          <span key={s} className={`h-2.5 flex-1 rounded-full ${i < current ? "bg-emerald-500" : i === current ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <li key={s} className={`text-xs leading-tight text-center ${i === current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
