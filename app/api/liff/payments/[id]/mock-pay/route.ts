// POST /api/liff/payments/{payment_id}/mock-pay   จำลองว่าลูกค้าสแกนจ่ายแล้ว (ใช้ได้เฉพาะ STRIPE_MOCK=true)
// ทำงานแทน webhook payment_intent.succeeded ของ Stripe
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerPayment } from "@/lib/customer-data";
import { markPaid } from "@/lib/payments";
import { isStripeMock } from "@/lib/stripe";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!isStripeMock()) return NextResponse.json({ error: "ใช้ได้เฉพาะโหมดจำลอง" }, { status: 404 });
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  const { id } = await params;

  const payment = await customerPayment(c.customer_id, Number(id));
  if (!payment) return NextResponse.json({ error: "ไม่พบรายการชำระเงิน" }, { status: 404 });

  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await markPaid(client, payment.payment_id);
    await client.query("commit");
    if (!result) return NextResponse.json({ error: "รายการนี้ไม่ได้รอชำระแล้ว" }, { status: 409 });
    return NextResponse.json(result);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
