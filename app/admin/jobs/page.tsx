// งานและสถานะงาน (Use Case 21)
import Link from "next/link";
import { pool } from "@/lib/db";
import { Card, JOB_STATUS, PageHeader, Table, thDate } from "@/components/admin/ui";
import { JobStatusControl } from "@/components/admin/JobStatusControl";

export default async function Jobs() {
  const { rows } = await pool.query(`
    select j.*, q.flowaccount_serial, q.details->'customer'->>'name' as customer,
           (select string_agg(t.name, ', ') from job_schedule s join technician t using (technician_id) where s.job_id = j.job_id) as technicians,
           (select min(work_time) from job_schedule s where s.job_id = j.job_id) as work_time
    from job j join quotation q using (quotation_id)
    order by j.created_at desc`);

  const count = (s: string) => rows.filter((j) => j.status === s).length;

  return (
    <>
      <PageHeader title="งานและสถานะงาน" sub={`งานทั้งหมด ${rows.length} งาน`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {Object.entries(JOB_STATUS).map(([key, [label]]) => (
          <div key={key} className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold font-mono">{count(key)}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <Card>
        {/* งาน (เลขงาน + ลูกค้า + ใบเสนอราคา) / ช่าง / นัด / เริ่ม / เสร็จ / สถานะ
            กำหนดสัดส่วนคอลัมน์ให้ข้อมูลกระจายเต็มความกว้าง ไม่กองซ้าย, size="lg" ตัวอักษรใหญ่แบบหน้าใบเสนอราคา */}
        <Table size="lg" headers={["งาน", "ช่าง", "นัดเข้างาน", "เริ่ม", "เสร็จ", "สถานะ"]} empty={!rows.length}>
          {rows.map((j) => (
            <tr key={j.job_id} className="hover:bg-muted/30 align-top">
              <td className="w-[28%] min-w-44">
                <p className="font-semibold">{j.customer}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono">#{j.job_id}</span> ·{" "}
                  <Link href={`/admin/quotations/${j.quotation_id}`} className="font-mono text-primary hover:underline">
                    {j.flowaccount_serial ?? `#${j.quotation_id}`}
                  </Link>
                </p>
              </td>
              <td className="w-[16%] min-w-28">{j.technicians ?? <span className="text-muted-foreground">ยังไม่จัดช่าง</span>}</td>
              <td className="w-[14%] text-sm text-muted-foreground whitespace-nowrap">{thDate(j.work_time, true)}</td>
              <td className="w-[12%] text-sm text-muted-foreground whitespace-nowrap">{thDate(j.started_at)}</td>
              <td className="w-[12%] text-sm text-muted-foreground whitespace-nowrap">{thDate(j.completed_at)}</td>
              {/* dropdown เลือกสถานะใหม่ (Use Case 21) แทนป้ายสถานะ */}
              <td className="w-[18%]"><JobStatusControl jobId={j.job_id} status={j.status} /></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
