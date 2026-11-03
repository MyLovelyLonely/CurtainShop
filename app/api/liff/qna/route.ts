// GET /api/liff/qna   คำถามที่พบบ่อยที่แอดมินเปิดแสดง (Use Case 6)
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";

export async function GET(req: Request) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  try {
    const r = await pool.query(`select qna_id, question, answer from qna where is_visible order by qna_id`);
    return NextResponse.json({ qna: r.rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
