// POST /api/liff/quotations/{quotation_id}/request-change   ลูกค้าแจ้งว่าข้อมูลใบเสนอราคาไม่ถูกต้อง (Activity Diagram 3-4)
// body: { note }   สิ่งที่ต้องแก้ เช่น "ห้องนอนกว้าง 2.2 ม."
//   บันทึกใน quotation.details.change_request แอดมินจึงกดแก้ไขใบเสนอราคาได้ (Use Case 15 Alternate Flow)
//   แจ้งได้เฉพาะก่อนยืนยันและก่อนออกใบแจ้งหนี้ (ช่วงเดียวกับที่แก้ไขได้)
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerQuotation } from "@/lib/customer-data";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  const { id } = await params;
  const { note } = await req.json().catch(() => ({}));
  if (!note?.trim()) return NextResponse.json({ error: "กรุณาระบุสิ่งที่ต้องแก้ไข" }, { status: 400 });

  try {
    const quotation = await customerQuotation(c.customer_id, Number(id));
    if (!quotation) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
    if (quotation.confirmed_at) return NextResponse.json({ error: "ยืนยันใบเสนอราคานี้แล้ว" }, { status: 409 });
    if (quotation.has_invoice) return NextResponse.json({ error: "ร้านออกใบแจ้งหนี้แล้ว กรุณาติดต่อร้านทางแชท" }, { status: 409 });

    const change_request = { note: note.trim(), requested_at: new Date().toISOString() };
    await pool.query(
      `update quotation set details = details || jsonb_build_object('change_request', $1::jsonb) where quotation_id = $2`,
      [change_request, id],
    );
    // TODO: แจ้งเตือนแอดมิน (Use Case 22)
    return NextResponse.json({ change_request });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
