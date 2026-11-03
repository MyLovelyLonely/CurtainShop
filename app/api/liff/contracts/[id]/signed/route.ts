// POST /api/liff/contracts/{contract_id}/signed   ลูกค้าส่งใบสัญญาที่เซ็นแล้วกลับมา (PDF หรือรูปถ่าย)
// body: multipart/form-data { file }
//   ส่งได้เมื่อยังไม่ได้ส่ง หรือแอดมินตีกลับให้แก้ (signed_file_url ว่าง) และแอดมินยังไม่ยืนยัน
//   ส่งแล้ว = แจ้งเตือนแอดมินผ่านกระดิ่ง (/api/admin/notifications ตรวจจาก signed_file_url มีค่า แต่ signed_at ว่าง)
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { uploadFile } from "@/lib/r2";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { contractStatus, PDF_OR_IMAGE, readUpload } from "@/lib/contract";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "กรุณาเลือกไฟล์" }, { status: 400 });
  const file = await readUpload(form, "file", PDF_OR_IMAGE);
  if ("error" in file) return NextResponse.json({ error: file.error }, { status: 400 });

  try {
    // กรองด้วย customer_id = ส่งไฟล์ให้สัญญาของคนอื่นไม่ได้
    const r = await pool.query(
      `select ct.* from contract ct join quotation q using (quotation_id) join price_estimate e using (estimate_id)
       where ct.contract_id = $1 and e.customer_id = $2`,
      [id, c.customer_id],
    );
    const contract = r.rows[0];
    if (!contract) return NextResponse.json({ error: "ไม่พบใบสัญญา" }, { status: 404 });
    if (contractStatus(contract) !== "waiting_sign") {
      return NextResponse.json({ error: "ส่งใบสัญญานี้แล้ว รอร้านตรวจสอบ" }, { status: 409 });
    }

    const url = await uploadFile(`contracts/q${contract.quotation_id}/signed-${Date.now()}.${file.ext}`, file.body, file.contentType);
    await pool.query(`update contract set signed_file_url = $1 where contract_id = $2 and signed_at is null`, [url, id]);
    // ส่งใหม่แล้ว = ล้างเหตุผลที่แอดมินตีกลับ
    await pool.query(`update quotation set details = details - 'contract_reject' where quotation_id = $1`, [contract.quotation_id]);
    return NextResponse.json({ signed_file_url: url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
