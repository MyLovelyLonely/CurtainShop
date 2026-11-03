import "server-only";
import { pool } from "./db";

const WORK_DURATION_HOURS = 4;

export async function saveJobSchedule(
  jobId: number,
  technicianIds: number[],
  workTime: string,
  editing: boolean,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(86132017)");

    const jobResult = await client.query(`select status from job where job_id = $1 for update`, [jobId]);
    if (!jobResult.rows[0]) throw new Error("ไม่พบงาน");
    if (["completed", "closed"].includes(jobResult.rows[0].status)) throw new Error("งานที่เสร็จแล้วหรือปิดแล้วไม่สามารถจัดตารางได้");

    const existing = await client.query(`select 1 from job_schedule where job_id = $1 limit 1`, [jobId]);
    if (editing && !existing.rows[0]) throw new Error("ไม่พบตารางงาน");
    if (!editing && existing.rows[0]) throw new Error("งานนี้มีตารางแล้ว กรุณาเลือกแก้ไขตารางเดิม");

    const techResult = await client.query(
      `select technician_id from technician where technician_id = any($1::int[])`,
      [technicianIds],
    );
    if (techResult.rowCount !== technicianIds.length) throw new Error("มีรายชื่อช่างที่ไม่พบในระบบ");

    const conflicts = await client.query(
      `select distinct t.name
       from job_schedule s
       join technician t using (technician_id)
       join job j using (job_id)
       where s.technician_id = any($1::int[])
         and s.job_id <> $2
         and j.status not in ('completed', 'closed')
         and s.work_time < $3::timestamptz + ($4::int * interval '1 hour')
         and s.work_time + ($4::int * interval '1 hour') > $3::timestamptz
       limit 1`,
      [technicianIds, jobId, workTime, WORK_DURATION_HOURS],
    );
    if (conflicts.rows[0]) throw new Error(`ช่าง ${conflicts.rows[0].name} มีคิวงานในช่วงเวลานี้แล้ว`);

    if (editing) await client.query(`delete from job_schedule where job_id = $1`, [jobId]);
    for (const technicianId of technicianIds) {
      await client.query(
        `insert into job_schedule (job_id, technician_id, work_time) values ($1, $2, $3)`,
        [jobId, technicianId, workTime],
      );
    }

    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteJobSchedule(jobId: number) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(86132017)");
    const job = await client.query(`select status from job where job_id = $1 for update`, [jobId]);
    if (!job.rows[0]) throw new Error("ไม่พบงาน");
    if (["completed", "closed"].includes(job.rows[0].status)) throw new Error("งานที่เสร็จแล้วหรือปิดแล้วไม่สามารถลบตารางได้");
    const result = await client.query(`delete from job_schedule where job_id = $1`, [jobId]);
    if (!result.rowCount) throw new Error("ไม่พบตารางงาน");
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function parseScheduleInput(input: unknown, requiredJobId?: number) {
  if (!input || typeof input !== "object") return { error: "ข้อมูลตารางงานไม่ถูกต้อง" };
  const body = input as Record<string, unknown>;
  const jobId = requiredJobId ?? Number(body.job_id);
  const rawTechIds = body.technician_ids;
  const technicianIds = Array.isArray(rawTechIds)
    ? [...new Set(rawTechIds.map(Number))]
    : [];
  const workTime = typeof body.work_time === "string" ? body.work_time : "";

  if (!Number.isSafeInteger(jobId) || jobId < 1) return { error: "กรุณาเลือกงาน" };
  if (!technicianIds.length || technicianIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    return { error: "กรุณาเลือกช่างอย่างน้อย 1 คน" };
  }
  if (!workTime || !Number.isFinite(Date.parse(workTime))) return { error: "กรุณาระบุวันและเวลาเริ่มงานให้ถูกต้อง" };
  return { values: { jobId, technicianIds, workTime: new Date(workTime).toISOString() } };
}
