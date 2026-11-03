// PUT /api/admin/technicians/{id} แก้ข้อมูลช่าง; DELETE ลบช่างที่ยังไม่มีตารางงาน
import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { parseTechnicianInput } from "@/lib/technician";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  if (!await currentAdmin()) return NextResponse.json({ error: "ไม่พบบัญชีแอดมินที่เข้าสู่ระบบ" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "รหัสช่างไม่ถูกต้อง" }, { status: 400 });
  const parsed = parseTechnicianInput(await req.json().catch(() => null));
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await pool.query(
      `update technician set name = $1, phone = $2, line_id = $3 where technician_id = $4 returning *`,
      [parsed.values!.name, parsed.values!.phone, parsed.values!.line_id, id],
    );
    if (!result.rows[0]) return NextResponse.json({ error: "ไม่พบข้อมูลช่าง" }, { status: 404 });
    return NextResponse.json({ technician: result.rows[0] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!await currentAdmin()) return NextResponse.json({ error: "ไม่พบบัญชีแอดมินที่เข้าสู่ระบบ" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "รหัสช่างไม่ถูกต้อง" }, { status: 400 });

  try {
    const technician = await pool.query(`select technician_id from technician where technician_id = $1`, [id]);
    if (!technician.rows[0]) return NextResponse.json({ error: "ไม่พบข้อมูลช่าง" }, { status: 404 });
    const schedule = await pool.query(`select 1 from job_schedule where technician_id = $1 limit 1`, [id]);
    if (schedule.rows[0]) return NextResponse.json({ error: "ลบช่างไม่ได้ เนื่องจากมีตารางงานผูกอยู่" }, { status: 409 });
    await pool.query(`delete from technician where technician_id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
