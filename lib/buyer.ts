// ข้อมูลลูกค้าที่ลูกค้าแก้ได้ (ตรวจฝั่งเซิร์ฟเวอร์)
//   parseProfile + saveProfile  = หน้าข้อมูลของฉัน (PUT /api/liff/me) เก็บในตาราง customer
//     name -> full_name, phone, address; email, zip_code -> details
//   parseEstimateBuyer          = ใบประเมินราคา (POST /api/liff/estimates) เก็บใน price_estimate.details.billing
//     บุคคลธรรมดา / นิติบุคคล คีย์ตรงกับช่อง contact* ของ FlowAccount (lib/documents.ts contactFields)
import "server-only";
import { pool } from "./db";
import type { Customer } from "./liff-auth";

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function read(input: Record<string, unknown> | undefined, keys: readonly string[]) {
  const b: Record<string, string> = Object.fromEntries(keys.map((k) => [k, clean(input?.[k])]));
  b.phone = b.phone.replace(/[-\s]/g, "");
  return b;
}

// กฎที่ใช้ทั้งสองฟอร์ม
function commonError(b: Record<string, string>) {
  return !b.phone ? "กรุณากรอกเบอร์มือถือ"
    : !b.address ? "กรุณากรอกที่อยู่"
    : !/^0\d{8,9}$/.test(b.phone) ? "เบอร์มือถือต้องเป็นตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0"
    : b.zip_code && !/^\d{5}$/.test(b.zip_code) ? "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก"
    : b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ? "รูปแบบอีเมลไม่ถูกต้อง"
    : b.name.length > 100 ? "ชื่อยาวเกิน 100 ตัวอักษร"
    : null;
}

// ---------- ข้อมูลของฉัน ----------

export function parseProfile(input: Record<string, unknown> | undefined) {
  const b = read(input, ["name", "phone", "address", "email", "zip_code"]);
  const error = !b.name ? "กรุณากรอกชื่อ-นามสกุล" : commonError(b);
  return error ? { error } : { values: b };
}

// บันทึกลงตาราง customer (รวมกับ details เดิม เก็บเฉพาะช่องที่มีค่า) คืนแถวใหม่
export async function saveProfile(c: Customer, b: Record<string, string>) {
  const details: Record<string, string> = { ...c.details };
  for (const k of ["email", "zip_code"] as const) {
    if (b[k]) details[k] = b[k];
    else delete details[k];
  }
  const r = await pool.query(
    `update customer set full_name = $1, phone = $2, address = $3, details = $4 where customer_id = $5 returning *`,
    [b.name, b.phone, b.address, details, c.customer_id],
  );
  return r.rows[0] as Customer;
}

// ---------- ใบประเมินราคา ----------

//   want_tax_invoice = ลูกค้าติ๊ก "ขอใบกำกับภาษี" ต้องมีเลขผู้เสียภาษี
export function parseEstimateBuyer(input: Record<string, unknown> | undefined) {
  const b = read(input, ["name", "contact_person", "phone", "address", "tax_id", "branch", "email", "zip_code"]);
  b.contact_group = input?.contact_group === "company" ? "company" : "person";
  const company = b.contact_group === "company";
  const wantTaxInvoice = input?.want_tax_invoice === true;
  if (!company) {
    b.contact_person = ""; b.branch = "";
  } else if (!b.branch) b.branch = "สำนักงานใหญ่";
  if (!wantTaxInvoice) b.tax_id = "";

  const error =
    !b.name ? (company ? "กรุณากรอกชื่อธุรกิจ" : "กรุณากรอกชื่อ-นามสกุล")
    : company && !b.contact_person ? "กรุณากรอกชื่อผู้ติดต่อ"
    : wantTaxInvoice && !/^\d{13}$/.test(b.tax_id) ? "เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก"
    : commonError(b);
  return error ? { error } : { values: { ...b, want_tax_invoice: wantTaxInvoice } };
}
