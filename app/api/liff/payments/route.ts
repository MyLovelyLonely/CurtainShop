// POST /api/liff/payments   ลูกค้าขอ QR PromptPay (Use Case 9 A1.1) / ขอ QR ใหม่เมื่อหมดอายุ (A1.3.1)
// body: { invoice_id }
//   ยอดเงินใช้ตามใบแจ้งหนี้เสมอ ไม่รับยอดจากหน้าเว็บ
//   QR เดิมที่ยังค้าง = ยกเลิก แล้วสร้างใหม่ (มี QR ใช้ได้ทีละอันต่อใบแจ้งหนี้)
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerInvoice } from "@/lib/customer-data";
import { cancelIntent, createPromptPay, expiresAt } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  const { invoice_id } = await req.json();

  try {
    const invoice = await customerInvoice(c.customer_id, Number(invoice_id));
    if (!invoice) return NextResponse.json({ error: "ไม่พบรายการที่ต้องชำระ" }, { status: 404 });
    if (invoice.is_paid) return NextResponse.json({ error: "รายการนี้ชำระแล้ว" }, { status: 409 });

    const old = await pool.query(
      `update payment set status = 'cancelled' where invoice_id = $1 and status = 'pending' and pay_method = 'qr_code'
       returning qr_ref`,
      [invoice.invoice_id],
    );
    await Promise.all(old.rows.filter((r) => r.qr_ref).map((r) => cancelIntent(r.qr_ref)));

    const intent = await createPromptPay(
      Number(invoice.amount),
      { invoice_id: String(invoice.invoice_id) },
      c.details?.email,
    );

    const p = await pool.query(
      `insert into payment (invoice_id, amount, qr_ref, status, pay_method)
       values ($1, $2, $3, 'pending', 'qr_code') returning payment_id`,
      [invoice.invoice_id, invoice.amount, intent.id],
    );

    return NextResponse.json({
      payment_id: p.rows[0].payment_id,
      amount: Number(invoice.amount),
      qr_image: intent.qr_image,
      expires_at: expiresAt(intent),
    }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "ไม่สามารถสร้าง QR Code ได้ กรุณาลองใหม่อีกครั้ง", detail: (e as Error).message }, { status: 502 });
  }
}
