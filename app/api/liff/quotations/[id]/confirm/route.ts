// POST /api/liff/quotations/{quotation_id}/confirm   ลูกค้ายืนยันใบเสนอราคา (Activity Diagram 3-4, ขอบเขต 1.3.3.3)
//   1. เปลี่ยนสถานะใน FlowAccount เป็น "อนุมัติ" (/quotations/{recordId}/status/approved)
//   2. บันทึกเวลาที่ยืนยันใน quotation.confirmed_at
//   ร้านออกใบแจ้งหนี้ไปแล้ว = ใบเสนอราคาใน FlowAccount ถูกล็อก จึงบันทึกเวลาอย่างเดียว
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowAccount } from "@/lib/flowaccount";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerQuotation } from "@/lib/customer-data";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  const { id } = await params;

  try {
    const quotation = await customerQuotation(c.customer_id, Number(id));
    if (!quotation) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
    if (quotation.confirmed_at) return NextResponse.json({ error: "ยืนยันใบเสนอราคานี้แล้ว" }, { status: 409 });

    if (quotation.record_id && !quotation.has_invoice) {
      const fa = await flowAccount("POST", `/quotations/${quotation.record_id}/status/approved`);
      if (fa.status !== 200 || !fa.data?.status) {
        return NextResponse.json({ error: "ไม่สามารถยืนยันได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง", flowaccount: fa.data }, { status: 502 });
      }
    }

    const r = await pool.query(
      `update quotation set confirmed_at = now() where quotation_id = $1 and confirmed_at is null returning confirmed_at`,
      [id],
    );
    // TODO: แจ้งเตือนแอดมิน (Use Case 22) เมื่อมี LINE Messaging API
    return NextResponse.json({ confirmed_at: r.rows[0]?.confirmed_at });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
