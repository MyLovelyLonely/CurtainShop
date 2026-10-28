// GET /api/liff/me   ข้อมูลลูกค้าที่ login อยู่ (Use Case 1)
import { NextResponse } from "next/server";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";

export async function GET(req: Request) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  return NextResponse.json({
    customer: { display_name: c.display_name, full_name: c.full_name, phone: c.phone, address: c.address },
  });
}
