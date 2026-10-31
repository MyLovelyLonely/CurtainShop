// GET /api/liff/me   ข้อมูลลูกค้าที่ login อยู่ (Use Case 1)
// PUT /api/liff/me   ลูกค้าแก้ไขข้อมูลของตัวเอง (ชื่อ LINE ดึงจาก LINE แก้ไม่ได้)
//   body: { name, phone, address, email, zip_code }
//   กฎและการเก็บลงตาราง customer อยู่ใน lib/buyer.ts (ใบประเมินราคาเก็บแยกใน price_estimate.details)
import { NextResponse } from "next/server";
import { currentCustomer, unauthorized, type Customer } from "@/lib/liff-auth";
import { parseProfile, saveProfile } from "@/lib/buyer";

const DETAIL_KEYS = ["email", "zip_code"] as const;

const view = (c: Customer) => ({
  customer: {
    display_name: c.display_name, full_name: c.full_name, phone: c.phone, address: c.address,
    details: Object.fromEntries(DETAIL_KEYS.map((k) => [k, c.details?.[k] ?? ""])),
  },
});

export async function GET(req: Request) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  return NextResponse.json(view(c));
}

export async function PUT(req: Request) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();

  const buyer = parseProfile(await req.json().catch(() => ({})));
  if (buyer.error) return NextResponse.json({ error: buyer.error }, { status: 400 });
  try {
    return NextResponse.json(view(await saveProfile(c, buyer.values!)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
