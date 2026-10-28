// ภาพรวมธุรกิจ (Use Case 14: ดูรายงานและแดชบอร์ดธุรกิจ)
import Link from "next/link";
import { Banknote, Calculator, ClipboardList, Receipt } from "lucide-react";
import { pool } from "@/lib/db";
import { Badge, baht, Card, JOB_STATUS, PageHeader, StatCard, StatusBadge, Table, thDate } from "@/components/admin/ui";

export default async function Dashboard() {
  const [revenue, monthly, jobs, estimates, unpaid, recent] = await Promise.all([
    // รายได้เดือนนี้ = เงินที่รับแล้ว
    pool.query(`select coalesce(sum(amount),0) as total from payment
                where status = 'paid' and paid_at >= date_trunc('month', now())`),
    // รายได้ย้อนหลัง 6 เดือน
    pool.query(`select to_char(m, 'YYYY-MM') as month, coalesce(sum(p.amount),0) as total
                from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
                left join payment p on p.status = 'paid' and date_trunc('month', p.paid_at) = m
                group by m order by m`),
    pool.query(`select status, count(*)::int as n from job group by status`),
    pool.query(`select count(*)::int as n from price_estimate where not is_contacted`),
    // ใบแจ้งหนี้ที่ยังไม่มีการชำระที่ paid
    pool.query(`select count(*)::int as n, coalesce(sum(i.amount),0) as total from invoice i
                where not exists (select 1 from payment p where p.invoice_id = i.invoice_id and p.status = 'paid')`),
    pool.query(`select q.quotation_id, q.flowaccount_serial, q.total_amount, q.created_at, q.confirmed_at,
                       q.details->'customer'->>'name' as customer, j.status as job_status
                from quotation q left join job j using (quotation_id)
                order by q.created_at desc limit 5`),
  ]);

  const jobCount = Object.fromEntries(jobs.rows.map((r) => [r.status, r.n]));
  const activeJobs = (jobCount.pending ?? 0) + (jobCount.in_progress ?? 0);
  const max = Math.max(1, ...monthly.rows.map((r) => Number(r.total)));

  return (
    <>
      <PageHeader title="ภาพรวมธุรกิจ" sub={`ข้อมูล ณ ${thDate(new Date(), true)}`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="รายได้เดือนนี้" value={baht(revenue.rows[0].total)} sub="จากการชำระเงินที่ได้รับแล้ว" icon={Banknote} color="bg-amber-500" />
        <StatCard label="งานที่ยังไม่เสร็จ" value={String(activeJobs)} sub={`รอ ${jobCount.pending ?? 0} · กำลังทำ ${jobCount.in_progress ?? 0}`} icon={ClipboardList} color="bg-blue-500" />
        <StatCard label="ใบประเมินรอติดต่อ" value={`${estimates.rows[0].n} ใบ`} sub="ลูกค้ารอนัดดูหน้างาน" icon={Calculator} color="bg-emerald-600" />
        <StatCard label="ใบแจ้งหนี้รอชำระ" value={`${unpaid.rows[0].n} ใบ`} sub={`มูลค่า ${baht(unpaid.rows[0].total)}`} icon={Receipt} color="bg-purple-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="รายได้รายเดือน (฿)" className="lg:col-span-2">
          <div className="flex items-end gap-3 h-48 px-4 pb-4">
            {monthly.rows.map((r) => (
              <div key={r.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[10px] font-mono text-muted-foreground">{Number(r.total).toLocaleString("th-TH")}</span>
                <div className="w-full bg-primary rounded-t-md" style={{ height: `${(Number(r.total) / max) * 100}%`, minHeight: 2 }} />
                <span className="text-[11px] text-muted-foreground">{r.month.slice(5)}/{r.month.slice(2, 4)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="สถานะงาน">
          <div className="px-4 pb-4 space-y-2">
            {Object.entries(JOB_STATUS).map(([key, [label]]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span>{label}</span>
                <span className="font-mono font-bold">{jobCount[key] ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="ใบเสนอราคาล่าสุด">
        <Table headers={["เลขที่", "ลูกค้า", "ยอดรวม", "วันที่", "สถานะ"]} empty={!recent.rows.length}>
          {recent.rows.map((q) => (
            <tr key={q.quotation_id} className="hover:bg-muted/30">
              <td className="font-mono text-xs">
                <Link href={`/admin/quotations/${q.quotation_id}`} className="text-primary hover:underline">
                  {q.flowaccount_serial ?? `#${q.quotation_id}`}
                </Link>
              </td>
              <td>{q.customer}</td>
              <td className="font-mono">{baht(q.total_amount)}</td>
              <td className="text-muted-foreground">{thDate(q.created_at)}</td>
              <td>
                {q.job_status ? <StatusBadge map={JOB_STATUS} status={q.job_status} />
                  : q.confirmed_at ? <Badge color="emerald">ลูกค้ายืนยันแล้ว</Badge>
                  : <Badge color="amber">รอลูกค้ายืนยัน</Badge>}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
