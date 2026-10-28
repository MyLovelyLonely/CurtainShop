// ช่างและตารางงาน (Use Case 18, 19)
import { pool } from "@/lib/db";
import { Card, JOB_STATUS, PageHeader, StatusBadge, Table, thDate } from "@/components/admin/ui";

export default async function Technicians() {
  const [techs, schedule] = await Promise.all([
    pool.query(`
      select t.*,
             count(distinct s.job_id) filter (where j.status in ('completed','closed'))::int as done,
             count(distinct s.job_id)::int as total
      from technician t
      left join job_schedule s using (technician_id) left join job j using (job_id)
      group by t.technician_id order by t.name`),
    pool.query(`
      select s.*, t.name as technician, j.status, q.details->'customer'->>'name' as customer,
             q.details->'customer'->>'address' as address
      from job_schedule s join technician t using (technician_id) join job j using (job_id) join quotation q using (quotation_id)
      where s.work_time >= now() - interval '1 day'
      order by s.work_time`),
  ]);

  return (
    <>
      <PageHeader title="ช่างและตารางงาน" sub={`ช่างทั้งหมด ${techs.rows.length} คน`} />

      <Card title="ช่าง">
        <Table headers={["ชื่อ", "เบอร์โทร", "LINE", "งานสำเร็จ", "งานทั้งหมด"]} empty={!techs.rows.length}>
          {techs.rows.map((t) => (
            <tr key={t.technician_id}>
              <td className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">{t.name.slice(0, 1)}</span>
                {t.name}
              </td>
              <td className="font-mono">{t.phone}</td>
              <td>{t.line_id ?? "-"}</td>
              <td className="font-mono">{t.done}</td>
              <td className="font-mono">{t.total}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="งานที่กำลังจะมาถึง">
        <Table headers={["วัน-เวลา", "ช่าง", "ลูกค้า", "สถานที่", "สถานะงาน"]} empty={!schedule.rows.length}>
          {schedule.rows.map((s) => (
            <tr key={s.schedule_id}>
              <td className="whitespace-nowrap">{thDate(s.work_time, true)}</td>
              <td>{s.technician}</td>
              <td>{s.customer}</td>
              <td className="text-muted-foreground">{s.address ?? "-"}</td>
              <td><StatusBadge map={JOB_STATUS} status={s.status} /></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
