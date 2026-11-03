// GET /api/liff/quotations/{quotation_id}   รายละเอียดใบเสนอราคาให้ลูกค้าตรวจสอบก่อนยืนยัน (ขอบเขต 1.3.3.3)
//   official_doc_available = export PDF ฉบับทางการจาก FlowAccount ได้ไหม ใช้ล็อกปุ่มยืนยัน (lib/confirm-rules.ts)
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerQuotation } from "@/lib/customer-data";
import { officialPdfAvailable } from "@/lib/flowaccount";
import { REQUIRE_OFFICIAL_DOC_TO_CONFIRM } from "@/lib/confirm-rules";

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
    // เช็กกับ FlowAccount เฉพาะตอนเปิดสวิตช์ และใบยังรอยืนยัน (ใบที่ยืนยันแล้วไม่ต้องเช็ก ประหยัดการเรียก FlowAccount)
    //   สวิตช์ปิด = ถือว่าเปิดได้เสมอ ปุ่มยืนยันจะไม่ถูกล็อก
    const checkDoc = REQUIRE_OFFICIAL_DOC_TO_CONFIRM && !quotation.confirmed_at;
    const official_doc_available = checkDoc
      ? Boolean(quotation.record_id) && (await officialPdfAvailable("quotations", Number(quotation.record_id)))
      : true;
    return NextResponse.json({ quotation, items: items.rows, official_doc_available });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
