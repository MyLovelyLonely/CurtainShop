// GET /api/admin/receipts/{receipt_id}   ดูใบเสร็จ: ข้อมูลในฐานข้อมูล + เอกสารจาก FlowAccount
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowAccount } from "@/lib/flowaccount";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const r = await pool.query(`select * from receipt where receipt_id = $1`, [id]);
    const receipt = r.rows[0];
    if (!receipt) return NextResponse.json({ error: "ไม่พบใบเสร็จ" }, { status: 404 });

    const fa = receipt.flowaccount_record_id
      ? await flowAccount("GET", `/receipts/${receipt.flowaccount_record_id}`)
      : null;

    return NextResponse.json({ receipt, flowaccount: fa?.data ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
