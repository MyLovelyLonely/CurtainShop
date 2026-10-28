// GET /api/admin/invoices/{invoice_id}   ดูใบแจ้งหนี้: ข้อมูลในฐานข้อมูล + เอกสารจาก FlowAccount
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowAccount } from "@/lib/flowaccount";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const r = await pool.query(`select * from invoice where invoice_id = $1`, [id]);
    const invoice = r.rows[0];
    if (!invoice) return NextResponse.json({ error: "ไม่พบใบแจ้งหนี้" }, { status: 404 });

    const fa = invoice.flowaccount_record_id
      ? await flowAccount("GET", `/billing-notes/${invoice.flowaccount_record_id}`)
      : null;

    return NextResponse.json({ invoice, flowaccount: fa?.data ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
