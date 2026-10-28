// POST /api/stripe/webhook   Stripe แจ้งผลการชำระ (Use Case 9 A1.3 ตรวจสอบการชำระเงินโดยอัตโนมัติ)
// อยู่นอก /api/admin เพราะ Stripe เป็นคนเรียก ตรวจลายเซ็น Stripe-Signature แทนการ login
//   payment_intent.succeeded                 -> paid (+ มัดจำ = สร้างงาน "รอดำเนินการ")
//   payment_intent.payment_failed / canceled -> expired (ลูกค้าขอ QR ใหม่ได้)
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { markPaid } from "@/lib/payments";
import { verifyWebhook } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const raw = await req.text(); // ต้องใช้ body ดิบตรวจลายเซ็น
  if (!verifyWebhook(raw, req.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(raw);
  const intentId = event.data?.object?.id;
  const r = await pool.query(`select payment_id from payment where qr_ref = $1`, [intentId]);
  const paymentId = r.rows[0]?.payment_id;
  if (!paymentId) return NextResponse.json({ received: true }); // ไม่ใช่ของระบบนี้

  const client = await pool.connect();
  try {
    await client.query("begin");
    if (event.type === "payment_intent.succeeded") {
      await markPaid(client, paymentId);
    } else if (["payment_intent.payment_failed", "payment_intent.canceled"].includes(event.type)) {
      await client.query(`update payment set status = 'expired' where payment_id = $1 and status = 'pending'`, [paymentId]);
    }
    await client.query("commit");
    return NextResponse.json({ received: true });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 }); // 5xx = Stripe ส่งซ้ำให้เอง
  } finally {
    client.release();
  }
}
