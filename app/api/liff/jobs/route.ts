// GET /api/liff/jobs   สถานะงานของทุกใบเสนอราคา (Use Case 8)
import { NextResponse } from "next/server";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerJobs } from "@/lib/customer-data";

export async function GET(req: Request) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  try {
    return NextResponse.json({ jobs: await customerJobs(c.customer_id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
