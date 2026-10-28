// บันทึกผลการชำระเงิน (Use Case 9 ข้อ 6) ใช้ร่วมกันทั้งเงินสด (แอดมิน) และ QR (Stripe webhook)
//   payment -> paid, ยกเลิก QR อื่นที่ค้างของใบแจ้งหนี้เดียวกัน
//   ชำระมัดจำ -> สร้างงาน "รอดำเนินการ" (Activity Diagram 3-4, ขอบเขต 1.3.5.1)
import "server-only";
import type { PoolClient } from "pg";

export async function markPaid(client: PoolClient, paymentId: number) {
  const p = await client.query(
    `update payment set status = 'paid', paid_at = coalesce(paid_at, now())
     where payment_id = $1 and status = 'pending' returning *`,
    [paymentId],
  );
  const payment = p.rows[0];
  if (!payment) return null; // จ่ายไปแล้ว / หมดอายุ / ไม่พบ

  await client.query(
    `update payment set status = 'cancelled' where invoice_id = $1 and payment_id <> $2 and status = 'pending'`,
    [payment.invoice_id, paymentId],
  );

  const inv = await client.query(`select type, quotation_id from invoice where invoice_id = $1`, [payment.invoice_id]);
  let job = null;
  if (inv.rows[0]?.type === "deposit") {
    const j = await client.query(
      `insert into job (quotation_id, status) values ($1, 'pending') on conflict (quotation_id) do nothing returning *`,
      [inv.rows[0].quotation_id],
    );
    job = j.rows[0] ?? null;
  }

  // TODO: แจ้งเตือนลูกค้า (Flex Message) และแอดมิน (Use Case 22) เมื่อเชื่อม LINE Messaging API
  return { payment, job };
}
