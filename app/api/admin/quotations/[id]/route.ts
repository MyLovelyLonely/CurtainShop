// GET /api/admin/quotations/{quotation_id}   ดูใบเสนอราคา: ข้อมูลในฐานข้อมูล + เอกสารจาก FlowAccount
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowAccount } from "@/lib/flowaccount";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const q = await pool.query(`select * from quotation where quotation_id = $1`, [id]);
    const quotation = q.rows[0];
    if (!quotation) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });

    const items = await pool.query(
      `select qi.*, p.name as product_name
       from quotation_item qi join product p using (product_id)
       where qi.quotation_id = $1 order by qi.quotation_item_id`,
      [id],
    );

    // ดึงเอกสารจาก FlowAccount ด้วย recordId ที่บันทึกไว้
    const fa = quotation.flowaccount_record_id
      ? await flowAccount("GET", `/quotations/${quotation.flowaccount_record_id}`)
      : null;

    return NextResponse.json({ quotation, items: items.rows, flowaccount: fa?.data ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
