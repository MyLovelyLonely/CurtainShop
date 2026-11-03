// GET /api/liff/invoices   รายการที่ต้องชำระ (Use Case 9 ข้อ 1) + ประวัติการชำระเงิน (Use Case 10)
import { NextResponse } from "next/server";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerInvoices, customerPaymentHistory } from "@/lib/customer-data";

export async function GET(req: Request) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  try {
    const [invoices, history] = await Promise.all([customerInvoices(c.customer_id), customerPaymentHistory(c.customer_id)]);
    return NextResponse.json({ to_pay: invoices.filter((i) => !i.is_paid), history });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
