// POST /api/admin/payments   แอดมินบันทึกรับชำระเงินสด (Use Case 9 Alternate Flow A2)
// body: { invoice_id, amount }
//   ผู้บันทึกรับเงิน = แอดมินที่เข้าสู่ระบบ (lib/admin-auth.ts) ไม่รับจากหน้าเว็บ
//   ยอดต้องตรงกับใบแจ้งหนี้ ไม่ครบ = ไม่บันทึก สถานะไม่เปลี่ยน (A2.2.1)
//   บันทึกผลด้วย markPaid() ตัวเดียวกับ QR (lib/payments.ts)
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { r2 } from "@/lib/documents";
import { markPaid } from "@/lib/payments";
import { notifyJobStatus } from "@/lib/line";
import { currentAdmin } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const { invoice_id, amount } = await req.json();
  if (!invoice_id || amount === undefined) {
    return NextResponse.json({ error: "ต้องส่ง invoice_id และ amount" }, { status: 400 });
  }
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "ไม่พบบัญชีแอดมินที่เข้าสู่ระบบ" }, { status: 401 });

  const client = await pool.connect();
  try {
    const r = await client.query(`select * from invoice where invoice_id = $1`, [invoice_id]);
    const invoice = r.rows[0];
    if (!invoice) return NextResponse.json({ error: "ไม่พบใบแจ้งหนี้" }, { status: 404 });

    const paid = await client.query(`select 1 from payment where invoice_id = $1 and status = 'paid'`, [invoice_id]);
    if (paid.rowCount) return NextResponse.json({ error: "ใบแจ้งหนี้นี้ชำระแล้ว" }, { status: 409 });

    if (r2(Number(amount)) !== r2(Number(invoice.amount))) {
      return NextResponse.json(
        { error: `ยอดเงินไม่ตรงกับใบแจ้งหนี้ (ต้องชำระ ${Number(invoice.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท)` },
        { status: 400 },
      );
    }

    await client.query("begin");

    const p = await client.query(
      `insert into payment (invoice_id, admin_id, amount, status, pay_method)
       values ($1, $2, $3, 'pending', 'cash') returning payment_id`,
      [invoice_id, admin.admin_id, invoice.amount],
    );
    // paid + ยกเลิก QR ที่ค้าง + มัดจำ = สร้างงาน "รอดำเนินการ"
    const result = await markPaid(client, p.rows[0].payment_id);

    await client.query("commit");
    if (result?.job) await notifyJobStatus(result.job.job_id); // มัดจำแล้ว = งาน "รอดำเนินการ"
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
