// GET /api/admin/tax-invoices/{tax_invoice_id}   ดูใบกำกับภาษี: ข้อมูลในฐานข้อมูล + เอกสารจาก FlowAccount
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowAccount } from "@/lib/flowaccount";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const r = await pool.query(`select * from tax_invoice where tax_invoice_id = $1`, [id]);
    const taxInvoice = r.rows[0];
    if (!taxInvoice) return NextResponse.json({ error: "ไม่พบใบกำกับภาษี" }, { status: 404 });

    const fa = taxInvoice.flowaccount_record_id
      ? await flowAccount("GET", `/tax-invoices/${taxInvoice.flowaccount_record_id}`)
      : null;

    return NextResponse.json({ tax_invoice: taxInvoice, flowaccount: fa?.data ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
