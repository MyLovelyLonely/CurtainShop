// งานและสถานะงาน (Use Case 21)
import Link from "next/link";
import { pool } from "@/lib/db";
import { Card, JOB_STATUS, PageHeader, StatusBadge, Table, thDate } from "@/components/admin/ui";

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
        <Table headers={["#", "ลูกค้า", "ใบเสนอราคา", "ช่าง", "นัดเข้างาน", "เริ่ม", "เสร็จ", "สถานะ"]} empty={!rows.length}>
          {rows.map((j) => (
            <tr key={j.job_id} className="hover:bg-muted/30">
              <td className="font-mono text-xs">{j.job_id}</td>
              <td>{j.customer}</td>
              <td className="font-mono text-xs">
                <Link href={`/admin/quotations/${j.quotation_id}`} className="text-primary hover:underline">{j.flowaccount_serial ?? `#${j.quotation_id}`}</Link>
              </td>
              <td>{j.technicians ?? <span className="text-muted-foreground">ยังไม่จัดช่าง</span>}</td>
              <td className="text-muted-foreground">{thDate(j.work_time, true)}</td>
              <td className="text-muted-foreground">{thDate(j.started_at)}</td>
              <td className="text-muted-foreground">{thDate(j.completed_at)}</td>
              <td><StatusBadge map={JOB_STATUS} status={j.status} /></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
