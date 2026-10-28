// GET /api/liff/invoices/{invoice_id}   ยอดที่ต้องชำระของใบแจ้งหนี้ (Use Case 9 ข้อ 2-3)
import { NextResponse } from "next/server";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerInvoice } from "@/lib/customer-data";
import { isStripeMock } from "@/lib/stripe";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  const { id } = await params;
  try {
    const invoice = await customerInvoice(c.customer_id, Number(id));
    if (!invoice) return NextResponse.json({ error: "ไม่พบรายการที่ต้องชำระ" }, { status: 404 });
    return NextResponse.json({ invoice, mock: isStripeMock() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
