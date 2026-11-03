// GET /api/liff/payments/{payment_id}   หน้า QR ถามสถานะซ้ำทุกไม่กี่วินาที (Use Case 9 A1.3)
//   pending + เลยเวลาหมดอายุ = ยกเลิกที่ Stripe แล้วเปลี่ยนเป็น expired (A1.3.1)
//   ผลจ่ายสำเร็จมาทาง webhook (/api/stripe/webhook) ไม่ได้มาทาง endpoint นี้
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerPayment } from "@/lib/customer-data";
import { cancelIntent, expiresAt, getIntent } from "@/lib/stripe";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  const { id } = await params;

  try {
    const payment = await customerPayment(c.customer_id, Number(id));
    if (!payment) return NextResponse.json({ error: "ไม่พบรายการชำระเงิน" }, { status: 404 });

    let status = payment.status;
    let qr = null;
    if (status === "pending" && payment.qr_ref) {
      const intent = await getIntent(payment.qr_ref);
      if (Date.now() > expiresAt(intent).getTime()) {
        await cancelIntent(payment.qr_ref);
        const u = await pool.query(
          `update payment set status = 'expired' where payment_id = $1 and status = 'pending' returning status`,
          [payment.payment_id],
        );
        status = u.rows[0]?.status ?? (await customerPayment(c.customer_id, payment.payment_id)).status;
      } else {
        qr = { qr_image: intent.qr_image, expires_at: expiresAt(intent) };
      }
    }

    return NextResponse.json({ payment_id: payment.payment_id, invoice_id: payment.invoice_id, amount: Number(payment.amount), status, ...qr });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
