// POST /api/admin/jobs/{job_id}/status   แอดมินเปลี่ยนสถานะงาน (Use Case 21)
// body: { status: "in_progress" | "completed", confirm? }
//   แอดมินเปลี่ยนได้แค่ กำลังดำเนินการ / ดำเนินการเสร็จสิ้น (ขอบเขต 1.3.5.2)
//   รอดำเนินการ / ปิดงาน ระบบเปลี่ยนเอง (1.3.5.1)
//   ย้อนสถานะต้องส่ง confirm: true (Alternate Flow)
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

const ORDER = ["pending", "in_progress", "completed", "closed"];
const ADMIN_STATUSES = ["in_progress", "completed"];

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { status, confirm } = await req.json();
  if (!ADMIN_STATUSES.includes(status)) {
    return NextResponse.json({ error: "เปลี่ยนได้เฉพาะ in_progress หรือ completed" }, { status: 400 });
  }

  try {
    const r = await pool.query(`select * from job where job_id = $1`, [id]);
    const job = r.rows[0];
    if (!job) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
    if (job.status === "closed") return NextResponse.json({ error: "งานปิดแล้ว เปลี่ยนสถานะไม่ได้" }, { status: 409 });

    const from = ORDER.indexOf(job.status);
    const to = ORDER.indexOf(status);
    if (to === from) return NextResponse.json({ error: "สถานะเดิมอยู่แล้ว" }, { status: 409 });
    if (to > from + 1) return NextResponse.json({ error: "ต้องเปลี่ยนสถานะตามลำดับทีละขั้น" }, { status: 400 });
    if (to < from && confirm !== true) {
      return NextResponse.json({ error: "เป็นการย้อนสถานะ ต้องยืนยันก่อนบันทึก", need_confirm: true }, { status: 409 });
    }

    // เก็บเวลาเริ่ม/เสร็จ ไว้คำนวณระยะเวลาติดตั้งเฉลี่ย (ขอบเขต 1.3.11.2); ย้อนสถานะ = ล้างเวลาที่เกินมา
    const u = await pool.query(
      `update job set status = $1::varchar,
         started_at   = case when $1::varchar = 'in_progress' then coalesce(started_at, now()) else started_at end,
         completed_at = case when $1::varchar = 'completed' then now() else null end
       where job_id = $2 returning *`,
      [status, id],
    );

    // TODO: แจ้งเตือนลูกค้าผ่าน LINE OA (Use Case 21 ข้อ 5) เมื่อเชื่อม Messaging API
    return NextResponse.json({ job: u.rows[0] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
