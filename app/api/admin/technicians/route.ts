// POST /api/admin/technicians เพิ่มข้อมูลช่าง
import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { parseTechnicianInput } from "@/lib/technician";

export async function POST(req: NextRequest) {
  if (!await currentAdmin()) return NextResponse.json({ error: "ไม่พบบัญชีแอดมินที่เข้าสู่ระบบ" }, { status: 401 });
  const parsed = parseTechnicianInput(await req.json().catch(() => null));
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await pool.query(
      `insert into technician (name, phone, line_id) values ($1, $2, $3) returning *`,
      [parsed.values!.name, parsed.values!.phone, parsed.values!.line_id],
    );
    return NextResponse.json({ technician: result.rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
