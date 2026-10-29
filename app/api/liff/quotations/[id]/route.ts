// GET /api/liff/quotations/{quotation_id}   รายละเอียดใบเสนอราคาให้ลูกค้าตรวจสอบก่อนยืนยัน (ขอบเขต 1.3.3.3)
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerQuotation } from "@/lib/customer-data";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  const { id } = await params;
  try {
    const quotation = await customerQuotation(c.customer_id, Number(id));
    if (!quotation) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
    const items = await pool.query(
      `select qi.quotation_item_id, qi.width, qi.height, qi.quantity, qi.unit_price, p.name, p.price_unit
       from quotation_item qi join product p using (product_id)
       where qi.quotation_id = $1 order by qi.quotation_item_id`,
      [id],
    );
    return NextResponse.json({ quotation, items: items.rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
