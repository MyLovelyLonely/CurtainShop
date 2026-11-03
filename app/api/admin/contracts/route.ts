// POST /api/admin/contracts   แอดมินส่งใบสัญญาซื้อขาย (PDF ที่ร้านเซ็นแล้ว) ให้ลูกค้า (Use Case 15 ข้อ 3, Activity Diagram 3-4)
// body: multipart/form-data { quotation_id, file (PDF) }
//   ส่งได้หลังลูกค้ายืนยันใบเสนอราคา ใบเสนอราคา 1 ใบมีสัญญาได้ 1 ฉบับ (ER: Quotation 1 - 0..1 Contract)
//   ไฟล์เก็บใน R2 แล้วบันทึก contract.file_url จากนั้นแจ้งลูกค้าทาง LINE
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { uploadFile } from "@/lib/r2";
import { notifyContractSent } from "@/lib/line";
import { PDF_ONLY, readUpload } from "@/lib/contract";

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const quotationId = Number(form?.get("quotation_id"));
  if (!form || !quotationId) return NextResponse.json({ error: "ต้องส่ง quotation_id" }, { status: 400 });

  const file = await readUpload(form, "file", PDF_ONLY);
  if ("error" in file) return NextResponse.json({ error: file.error }, { status: 400 });

  try {
    const q = await pool.query(`select confirmed_at from quotation where quotation_id = $1`, [quotationId]);
    if (!q.rows[0]) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
    if (!q.rows[0].confirmed_at) return NextResponse.json({ error: "ลูกค้ายังไม่ยืนยันใบเสนอราคา" }, { status: 400 });

    const exists = await pool.query(`select contract_id from contract where quotation_id = $1`, [quotationId]);
    if (exists.rowCount) return NextResponse.json({ error: "ใบเสนอราคานี้มีใบสัญญาแล้ว" }, { status: 409 });

    const url = await uploadFile(`contracts/q${quotationId}/shop-${Date.now()}.pdf`, file.body, file.contentType);
    const r = await pool.query(
      `insert into contract (quotation_id, file_url) values ($1, $2) returning *`, [quotationId, url]);

    await notifyContractSent(r.rows[0].contract_id);
    return NextResponse.json({ contract: r.rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
