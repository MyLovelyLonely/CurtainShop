"use client";
// สถานะงาน (Use Case 8) การ์ดละ 1 งาน แถบขั้นตอนตามสถานะในตาราง Job (Data Dictionary 3-35)
//   pending -> in_progress -> completed -> closed
import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import { baht, thDate } from "@/components/admin/ui";
import { useLiffData } from "@/components/liff/LiffProvider";
import { Empty, PageTitle, Panel, StepBar } from "@/components/liff/ui";

type Job = {
  job_id: number; status: string; created_at: string; started_at: string | null; completed_at: string | null;
  quotation_id: number; qt_serial: string | null; total_amount: string; project_name: string | null; next_visit: string | null;
};

const STATUSES = ["pending", "in_progress", "completed", "closed"];
const STEPS = ["รอดำเนินการ", "กำลังดำเนินการ", "ดำเนินการเสร็จสิ้น", "ปิดงาน"];

// คำอธิบายใต้หัวการ์ด + ปุ่มที่ลูกค้าต้องทำต่อ (ถ้ามี)
function detail(j: Job): { sub: string; action?: { href: string; label: string } } {
  switch (j.status) {
    case "pending": return { sub: "ได้รับมัดจำแล้ว ร้านจะนัดวันเข้าติดตั้ง" };
    case "in_progress": return { sub: j.started_at ? `ช่างเริ่มงาน ${thDate(j.started_at, true)}` : "ช่างกำลังติดตั้ง" };
    case "completed": return {
      sub: `ติดตั้งเสร็จ ${j.completed_at ? thDate(j.completed_at, true) : ""} · รอชำระยอดคงเหลือ`,
      action: { href: "/liff/payments", label: "ชำระยอดคงเหลือ" },
    };
    default: return { sub: "ขอบคุณที่ใช้บริการ" };
  }
}

export default function LiffJobs() {
  const { data, error } = useLiffData<{ jobs: Job[] }>("/api/liff/jobs");

  return (
    <>
      <PageTitle title="สถานะงาน" />
      {error && <Panel className="text-red-700 text-base">{error}</Panel>}
      {!data && !error && <Panel className="text-center text-muted-foreground">กำลังโหลด...</Panel>}
      {data && !data.jobs.length && <Empty>ยังไม่มีงาน<br /><span className="text-sm">งานจะเริ่มหลังชำระมัดจำ</span></Empty>}

      {data?.jobs.map((j) => {
        const i = STATUSES.indexOf(j.status);
        const closed = j.status === "closed";
        const d = detail(j);
        return (
          <Panel key={j.job_id} className={`space-y-4 ${closed ? "opacity-80" : ""}`}>
            <div className="flex justify-between items-start gap-2">
              <div>
                <p className={`text-xl font-bold ${closed ? "text-emerald-700" : ""}`}>{STEPS[i] ?? j.status}</p>
                <p className="text-base text-muted-foreground">{d.sub}</p>
              </div>
              <p className="text-base font-mono font-semibold whitespace-nowrap">{baht(j.total_amount)}</p>
            </div>

            {/* ปิดงานแล้ว = ทุกขั้นเป็นสีเขียว */}
            <StepBar steps={STEPS} current={closed ? STEPS.length : i} />

            {j.next_visit && (
              <p className="flex items-center gap-2 text-base bg-blue-50 text-blue-900 rounded-xl px-3 py-2">
                <CalendarClock size={18} /> นัดช่าง {thDate(j.next_visit, true)}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground border-t border-border pt-3">
              <span>ใบเสนอราคา {j.qt_serial ?? `#${j.quotation_id}`}{j.project_name ? ` · ${j.project_name}` : ""}</span>
              <Link href="/liff/documents" className="text-primary font-medium whitespace-nowrap">เอกสาร</Link>
            </div>

            {d.action && (
              <Link href={d.action.href}
                className="flex items-center justify-center gap-1 bg-primary text-primary-foreground rounded-xl py-3 text-lg font-semibold">
                {d.action.label} <ChevronRight size={20} />
              </Link>
            )}
          </Panel>
        );
      })}
    </>
  );
}
