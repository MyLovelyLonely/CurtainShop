// จัดการข้อมูลช่างและปฏิทินตารางงาน (Use Case 18, 19)
import { pool } from "@/lib/db";
import TechnicianManager from "@/components/admin/TechnicianManager";

type SearchParams = { month?: string };

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

function currentDay() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

export default async function Technicians({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? params.month! : currentMonth();
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = new Date(`${month}-01T00:00:00+07:00`);
  const nextMonth = new Date(year, monthNumber, 1);
  const monthEnd = new Date(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01T00:00:00+07:00`);

  const [technicians, jobs, schedule] = await Promise.all([
    pool.query(`
      select t.technician_id, t.name, t.phone, t.line_id,
             count(distinct s.job_id) filter (where j.status in ('completed','closed'))::int as done,
             count(distinct s.job_id)::int as total
      from technician t
      left join job_schedule s using (technician_id)
      left join job j using (job_id)
      group by t.technician_id order by t.name`),
    pool.query(`
      select j.job_id, j.status, q.quotation_id, q.flowaccount_serial as quotation_serial,
             q.details->'customer'->>'name' as customer, q.details->'customer'->>'address' as address,
             exists (select 1 from job_schedule s where s.job_id = j.job_id) as has_schedule
      from job j
      join quotation q using (quotation_id)
      where j.status in ('pending', 'in_progress')
         or exists (select 1 from job_schedule s where s.job_id = j.job_id)
      order by j.created_at desc`),
    pool.query(`
      select j.job_id, j.status, q.quotation_id, q.flowaccount_serial as quotation_serial,
             q.details->'customer'->>'name' as customer, q.details->'customer'->>'address' as address,
             min(s.work_time) as work_time,
             array_agg(distinct t.technician_id order by t.technician_id)::int[] as technician_ids,
             string_agg(distinct t.name, ', ' order by t.name) as technicians
      from job_schedule s
      join job j using (job_id)
      join quotation q using (quotation_id)
      join technician t using (technician_id)
      where s.work_time >= $1 and s.work_time < $2
      group by j.job_id, q.quotation_id
      order by min(s.work_time)`,
      [monthStart.toISOString(), monthEnd.toISOString()]),
  ]);

  return (
    <TechnicianManager
      month={month}
      today={currentDay()}
      technicians={technicians.rows}
      jobs={jobs.rows}
      schedule={schedule.rows}
    />
  );
}
