// GET /api/admin/notifications   แจ้งเตือนแอดมินเมื่อเกิดเหตุการณ์สำคัญ (Use Case 22, ขอบเขต 1.3.6.3)
// ไม่มีตารางแจ้งเตือนแยก: ระบบตรวจจากสถานะเอกสารที่ค้างอยู่ในตารางเดิม (Data Dictionary)
//   1. ใบประเมินราคาใหม่          price_estimate.is_contacted = false
//   2. ลูกค้ายืนยันใบเสนอราคา      quotation.confirmed_at มีค่า แต่ยังไม่ออกใบแจ้งหนี้
//   3. ลูกค้าแจ้งแก้ไขใบเสนอราคา   quotation.details.change_request มีค่า
//   4. ลูกค้าชำระเงิน              payment.status = 'paid' แต่ยังไม่ออกใบเสร็จ
// แอดมินจัดการงานเสร็จ = สถานะเปลี่ยน = แจ้งเตือนหายเอง
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const r = await pool.query(`
      select 'ใบประเมินราคาใหม่ #' || e.estimate_id || ' · ' || coalesce(c.full_name, c.display_name) as message,
             '/admin/estimates' as link, e.created_at as at
      from price_estimate e join customer c using (customer_id)
      where not e.is_contacted

      union all
      select 'ลูกค้ายืนยันใบเสนอราคา ' || coalesce(q.flowaccount_serial, '#' || q.quotation_id) || ' · รอออกใบแจ้งหนี้',
             '/admin/quotations/' || q.quotation_id, q.confirmed_at
      from quotation q
      where q.confirmed_at is not null
        and not exists (select 1 from invoice i where i.quotation_id = q.quotation_id)

      union all
      select 'ลูกค้าแจ้งแก้ไขใบเสนอราคา ' || coalesce(q.flowaccount_serial, '#' || q.quotation_id) || ': ' || (q.details->'change_request'->>'note'),
             '/admin/quotations/' || q.quotation_id, (q.details->'change_request'->>'requested_at')::timestamptz
      from quotation q
      where q.details->'change_request' is not null and q.details->'change_request' <> 'null'::jsonb

      union all
      select 'ลูกค้าชำระเงิน ' || to_char(p.amount, 'FM999,999,990.00') || ' บาท · รอออกใบเสร็จ',
             '/admin/invoices', p.paid_at
      from payment p
      where p.status = 'paid'
        and not exists (select 1 from receipt r where r.payment_id = p.payment_id)

      order by at desc`);
    return NextResponse.json({ notifications: r.rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
