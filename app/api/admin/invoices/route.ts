// POST /api/admin/invoices   สร้างใบแจ้งหนี้ (มัดจำ/คงเหลือ) จากใบเสนอราคา: บันทึกลงฐานข้อมูล + upgrade ใน FlowAccount
// body: { quotation_id, type: "deposit" | "balance", due_date? }
//   amount: deposit = quotation.deposit_amount, balance = total_amount - deposit_amount
//   due_date ไม่ส่ง = อีก 7 วัน
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowAccount } from "@/lib/flowaccount";
import { amountFields, contactFields, FA_DOC_TYPE, faDoc, r2, today } from "@/lib/documents";

const DEFAULT_DUE_DAYS = 7;

export async function POST(req: NextRequest) {
  const { quotation_id, type, due_date } = await req.json();
  if (!quotation_id || !["deposit", "balance"].includes(type)) {
    return NextResponse.json({ error: "ต้องส่ง quotation_id และ type (deposit | balance)" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const q = await client.query(`select * from quotation where quotation_id = $1`, [quotation_id]);
    const quotation = q.rows[0];
    if (!quotation) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
    if (!quotation.flowaccount_record_id) {
      return NextResponse.json({ error: "ใบเสนอราคายังไม่มีใน FlowAccount" }, { status: 400 });
    }

    // ใบแจ้งหนี้มัดจำออกได้หลังลูกค้ายืนยันใบเสนอราคา (Activity Diagram 3-4)
    if (type === "deposit" && !quotation.confirmed_at) {
      return NextResponse.json({ error: "ลูกค้ายังไม่ยืนยันใบเสนอราคา" }, { status: 400 });
    }

    // ใบแจ้งหนี้ยอดคงเหลือออกได้หลังงานเสร็จสิ้น (Activity Diagram 3-5)
    if (type === "balance") {
      const j = await client.query(`select status from job where quotation_id = $1`, [quotation_id]);
      if (!["completed", "closed"].includes(j.rows[0]?.status)) {
        return NextResponse.json({ error: "ต้องเปลี่ยนสถานะงานเป็น \"ดำเนินการเสร็จสิ้น\" ก่อนออกใบแจ้งหนี้ยอดคงเหลือ" }, { status: 400 });
      }
    }

    const total = Number(quotation.total_amount);
    const deposit = Number(quotation.deposit_amount);
    const amount = r2(type === "deposit" ? deposit : total - deposit);
    const dueDate = due_date ?? today(DEFAULT_DUE_DAYS);
    const label = type === "deposit" ? "ค่ามัดจำ" : "ยอดคงเหลือ";

    await client.query("begin");

    const ins = await client.query(
      `insert into invoice (quotation_id, type, amount, due_date) values ($1, $2, $3, $4) returning *`,
      [quotation_id, type, amount, dueDate],
    );
    const invoice = ins.rows[0];

    // มัดจำ: upgrade ใบเสนอราคา -> ใบแจ้งหนี้ (billing-notes)
    // คงเหลือ: FlowAccount ไม่ให้ upgrade ใบเสนอราคาซ้ำ (code 70002 "read only status")
    //   จึงสร้างใบแจ้งหนี้ใหม่ แล้วอ้างอิงเลขใบเสนอราคาใน reference + remarks แทน
    const upgrade = type === "deposit";
    const fa = await flowAccount("POST", upgrade ? "/upgrade/billing-notes" : "/billing-notes", {
      recordId: 0,
      documentStructureType: upgrade ? "UpgradeSimpleDocument" : "SimpleDocument",
      ...(upgrade && {
        documentReference: [
          {
            recordId: Number(quotation.flowaccount_record_id),
            referenceDocumentSerial: quotation.flowaccount_serial,
            referenceDocumentType: FA_DOC_TYPE.quotation,
          },
        ], // required ตอน upgrade
      }),
      remarks: upgrade ? "" : `ยอดคงเหลือตามใบเสนอราคา ${quotation.flowaccount_serial} (หักมัดจำแล้ว)`,
      ...contactFields(quotation.details.customer),
      publishedOn: today(),
      creditType: 1,
      dueDate,
      projectName: quotation.details.project_name ?? "",
      reference: quotation.flowaccount_serial,
      ...amountFields(amount, `${label} ใบเสนอราคา ${quotation.flowaccount_serial}`),
    });

    const doc = faDoc(fa);
    if (!doc) {
      await client.query("rollback");
      return NextResponse.json({ error: "สร้างใน FlowAccount ไม่สำเร็จ", flowaccount: fa.data }, { status: 502 });
    }

    const updated = await client.query(
      `update invoice set flowaccount_record_id = $1, flowaccount_serial = $2 where invoice_id = $3 returning *`,
      [doc.recordId, doc.documentSerial, invoice.invoice_id],
    );

    await client.query("commit");
    return NextResponse.json({ invoice: updated.rows[0] }, { status: 201 });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
