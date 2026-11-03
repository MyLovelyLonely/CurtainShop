// PATCH /api/admin/estimates/{id}/contacted เปลี่ยนสถานะการติดต่อกลับ
import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-auth";
import { pool } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await currentAdmin()) return NextResponse.json({ error: "ไม่พบบัญชีแอดมินที่เข้าสู่ระบบ" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "รหัสใบประเมินไม่ถูกต้อง" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.is_contacted !== "boolean") {
    return NextResponse.json({ error: "ต้องระบุสถานะการติดต่อ" }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `update price_estimate set is_contacted = $1 where estimate_id = $2 returning estimate_id, is_contacted`,
      [body.is_contacted, id],
    );
    if (!result.rows[0]) return NextResponse.json({ error: "ไม่พบใบประเมินราคา" }, { status: 404 });
    return NextResponse.json({ estimate: result.rows[0] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
