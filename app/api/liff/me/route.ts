// GET /api/liff/me   ข้อมูลลูกค้าที่ login อยู่ (Use Case 1)
// PUT /api/liff/me   ลูกค้าแก้ไขข้อมูลของตัวเอง (ชื่อ LINE ดึงจาก LINE แก้ไม่ได้)
//   body: { full_name, phone, address, details: { email, tax_id, branch, zip_code } }
//   details เก็บใน customer.details (jsonb) แล้วใช้ตอนออกเอกสาร FlowAccount เช่น ใบกำกับภาษี
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentCustomer, unauthorized, type Customer } from "@/lib/liff-auth";

const DETAIL_KEYS = ["email", "tax_id", "branch", "zip_code"] as const;

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

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// ตรวจรูปแบบตาม Data Dictionary (phone varchar 10, tax_id varchar 13)
function validate(f: Record<string, string>) {
  if (f.phone && !/^0\d{8,9}$/.test(f.phone)) return "เบอร์โทรศัพท์ต้องเป็นตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0";
  if (f.tax_id && !/^\d{13}$/.test(f.tax_id)) return "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก";
  if (f.zip_code && !/^\d{5}$/.test(f.zip_code)) return "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก";
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return "รูปแบบอีเมลไม่ถูกต้อง";
  if (f.full_name.length > 100) return "ชื่อ-นามสกุลยาวเกิน 100 ตัวอักษร";
  return null;
}

export async function PUT(req: Request) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const f: Record<string, string> = {
    full_name: clean(body.full_name),
    phone: clean(body.phone).replace(/[-\s]/g, ""),
    address: clean(body.address),
    ...Object.fromEntries(DETAIL_KEYS.map((k) => [k, clean(body.details?.[k])])),
  };
  const error = validate(f);
  if (error) return NextResponse.json({ error }, { status: 400 });

  // รวมกับ details เดิม เก็บเฉพาะช่องที่มีค่า
  const details = { ...c.details };
  for (const k of DETAIL_KEYS) {
    if (f[k]) details[k] = f[k];
    else delete details[k];
  }

  try {
    const r = await pool.query(
      `update customer set full_name = $1, phone = $2, address = $3, details = $4 where customer_id = $5 returning *`,
      [f.full_name || null, f.phone || null, f.address || null, details, c.customer_id],
    );
    return NextResponse.json(view(r.rows[0]));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
