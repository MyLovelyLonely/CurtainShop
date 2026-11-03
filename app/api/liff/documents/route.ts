// GET /api/liff/documents   เอกสารทั้งหมดของลูกค้า แยกตามประเภท (Use Case 8)
//   { quotations, invoices, tax_invoices, receipts, contracts }
import { NextResponse } from "next/server";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerDocuments } from "@/lib/customer-data";

export async function GET(req: Request) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  try {
    return NextResponse.json(await customerDocuments(c.customer_id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
