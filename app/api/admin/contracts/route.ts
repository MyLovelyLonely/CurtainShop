// POST /api/admin/contracts   สร้างใบสัญญาซื้อขายจากใบเสนอราคา (Use Case 15 ข้อ 3, Activity Diagram 3-4)
// body: { quotation_id }
//   สร้างได้หลังลูกค้ายืนยันใบเสนอราคา ใบเสนอราคา 1 ใบมีสัญญาได้ 1 ฉบับ (ER: Quotation 1 - 0..1 Contract)
//   ระบบสร้างสัญญาจากข้อมูลในระบบ file_url = หน้าใบสัญญาที่พิมพ์ / บันทึกเป็น PDF ได้
//   ข้อมูลไม่เปลี่ยนแล้วหลังลูกค้ายืนยัน (ใบเสนอราคาถูกล็อก) เอกสารจึงเหมือนเดิมทุกครั้งที่เปิด
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { quotation_id } = await req.json().catch(() => ({}));
  if (!quotation_id) return NextResponse.json({ error: "ต้องส่ง quotation_id" }, { status: 400 });

  const client = await pool.connect();
  try {
    const q = await client.query(`select confirmed_at from quotation where quotation_id = $1`, [quotation_id]);
    if (!q.rows[0]) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
    if (!q.rows[0].confirmed_at) return NextResponse.json({ error: "ลูกค้ายังไม่ยืนยันใบเสนอราคา" }, { status: 400 });

    const exists = await client.query(`select contract_id from contract where quotation_id = $1`, [quotation_id]);
    if (exists.rowCount) return NextResponse.json({ error: "ใบเสนอราคานี้มีใบสัญญาแล้ว" }, { status: 409 });

    await client.query("begin");
    const ins = await client.query(
      `insert into contract (quotation_id, file_url) values ($1, '') returning contract_id`, [quotation_id]);
    const id = ins.rows[0].contract_id;
    const r = await client.query(
      `update contract set file_url = $1 where contract_id = $2 returning *`, [`/admin/contracts/${id}`, id]);
    await client.query("commit");
    // TODO: แจ้งลูกค้าทาง LINE OA ให้ดาวน์โหลดสัญญาไปเซ็น
    return NextResponse.json({ contract: r.rows[0] }, { status: 201 });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
