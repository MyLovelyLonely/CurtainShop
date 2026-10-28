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
