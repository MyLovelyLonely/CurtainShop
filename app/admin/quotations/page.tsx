// รายการใบเสนอราคา แสดงเป็นการ์ดตัวใหญ่ อ่านง่าย แยกแท็บตามสถานะ
import { CalendarDays, ChevronRight, Plus, UserRound } from "lucide-react";
import { pool } from "@/lib/db";
import { Badge, baht, ButtonLink, EmptyState, JOB_STATUS, PageHeader, StatusBadge, Tabs, thDate } from "@/components/admin/ui";

const TABS = ["all", "waiting", "active", "closed"] as const;

export default async function Quotations({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t === tabParam) ?? "all";

  const { rows } = await pool.query(`
    select q.*, q.details->'customer'->>'name' as customer, a.full_name as admin_name, j.status as job_status
    from quotation q join admin a using (admin_id) left join job j using (quotation_id)
    order by q.created_at desc`);

  const waiting = rows.filter((q) => !q.confirmed_at && !q.job_status);
  const closed = rows.filter((q) => q.job_status === "closed");
  const active = rows.filter((q) => !waiting.includes(q) && !closed.includes(q));
  const list = { all: rows, waiting, active, closed }[tab];
  const total = rows.reduce((s, q) => s + Number(q.total_amount), 0);

  return (
    <>
      <PageHeader title="ใบเสนอราคา" sub={`ทั้งหมด ${rows.length} ใบ · มูลค่ารวม ${baht(total)}`}>
        <ButtonLink href="/admin/estimates"><Plus size={18} /> ทำจากใบประเมินราคา</ButtonLink>
      </PageHeader>

      <Tabs
        basePath="/admin/quotations"
        active={tab}
        tabs={[
          { key: "all", label: "ทั้งหมด", count: rows.length },
          { key: "waiting", label: "รอลูกค้ายืนยัน", count: waiting.length },
          { key: "active", label: "กำลังดำเนินการ", count: active.length },
          { key: "closed", label: "ปิดงานแล้ว", count: closed.length },
        ]}
      />

      {!list.length && <EmptyState>ไม่มีใบเสนอราคาในหมวดนี้</EmptyState>}

      <div className="space-y-3">
        {list.map((q) => (
          <div key={q.quotation_id} className="bg-card border border-border rounded-xl p-5 flex flex-wrap items-center gap-x-8 gap-y-4">
            {/* เลขที่ + ลูกค้า */}
            <div className="min-w-56 flex-1">
              <p className="text-sm text-muted-foreground font-mono">{q.flowaccount_serial ?? `#${q.quotation_id}`}</p>
              <p className="text-xl font-semibold">{q.customer}</p>
              {q.details?.project_name && <p className="text-base text-muted-foreground">{q.details.project_name}</p>}
            </div>

            {/* รายละเอียด */}
            <div className="space-y-1.5 text-base min-w-52">
              <p className="flex items-center gap-2"><CalendarDays size={17} className="text-muted-foreground" /> {thDate(q.created_at)}</p>
              <p className="flex items-center gap-2"><UserRound size={17} className="text-muted-foreground" /> ผู้จัดทำ {q.admin_name}</p>
            </div>

            {/* สถานะ */}
            <div className="flex flex-col gap-2 items-start min-w-40">
              {q.job_status ? <StatusBadge map={JOB_STATUS} status={q.job_status} size="lg" />
                : q.confirmed_at ? <Badge color="emerald" size="lg">ลูกค้ายืนยันแล้ว</Badge>
                : <Badge color="amber" size="lg">รอลูกค้ายืนยัน</Badge>}
              {q.details?.want_tax_invoice && <Badge color="purple" size="lg">ขอใบกำกับภาษี</Badge>}
            </div>

            {/* ยอดเงิน + ปุ่ม */}
            <div className="ml-auto flex items-center gap-5">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">รวมทั้งสิ้น</p>
                <p className="text-2xl font-bold font-mono">{baht(q.total_amount)}</p>
                <p className="text-sm text-muted-foreground">มัดจำ {baht(q.deposit_amount)}</p>
              </div>
              <ButtonLink href={`/admin/quotations/${q.quotation_id}`} variant="outline">
                ดูรายละเอียด <ChevronRight size={18} />
              </ButtonLink>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
