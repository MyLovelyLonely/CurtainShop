// POST /api/admin/receipts   ออกใบกำกับภาษี + ใบเสร็จ หลังการชำระเงินเป็น paid
// body: { payment_id }
//   1. upgrade ใบแจ้งหนี้ -> ใบกำกับภาษี (/upgrade/tax-invoices)        บันทึก tax_invoice
//   2. upgrade ใบกำกับภาษี -> ใบเสร็จ พร้อมรับเงิน (/upgrade/receipts/with-payment)  บันทึก receipt
// บันทึกรับเงินใน FlowAccount ที่ใบเสร็จครั้งเดียว
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowAccount } from "@/lib/flowaccount";
import { amountFields, contactFields, FA_DOC_TYPE, faDoc, today } from "@/lib/documents";

export async function POST(req: NextRequest) {
  const { payment_id } = await req.json();
  if (!payment_id) return NextResponse.json({ error: "ต้องส่ง payment_id" }, { status: 400 });

  const client = await pool.connect();
  try {
    const r = await client.query(
      `select p.*, i.type as invoice_type, i.flowaccount_record_id as inv_record_id,
              i.flowaccount_serial as inv_serial, q.details as q_details
       from payment p
       join invoice i using (invoice_id)
       join quotation q using (quotation_id)
       where p.payment_id = $1`,
      [payment_id],
    );
    const payment = r.rows[0];
    if (!payment) return NextResponse.json({ error: "ไม่พบการชำระเงิน" }, { status: 404 });
    if (payment.status !== "paid") return NextResponse.json({ error: "การชำระเงินยังไม่ paid" }, { status: 400 });
    if (!payment.inv_record_id) return NextResponse.json({ error: "ใบแจ้งหนี้ยังไม่มีใน FlowAccount" }, { status: 400 });

    const exists = await client.query(`select 1 from receipt where payment_id = $1`, [payment_id]);
    if (exists.rowCount) return NextResponse.json({ error: "ออกใบเสร็จของการชำระเงินนี้แล้ว" }, { status: 409 });

    const customer = payment.q_details.customer;
    const amount = Number(payment.amount);
    const paidDate = new Date(payment.paid_at ?? Date.now()).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
    const label = payment.invoice_type === "deposit" ? "ค่ามัดจำ" : "ยอดคงเหลือ";
    const common = {
      recordId: 0,
      ...contactFields(customer),
      publishedOn: today(),
      projectName: payment.q_details.project_name ?? "",
      reference: payment.inv_serial,
      ...amountFields(amount, `${label} ตามใบแจ้งหนี้ ${payment.inv_serial}`),
    };

    await client.query("begin");

    // 1. ใบกำกับภาษี
    const taxFa = await flowAccount("POST", "/upgrade/tax-invoices", {
      ...common,
      documentStructureType: "UpgradeSimpleDocument",
      documentReference: [
        {
          recordId: Number(payment.inv_record_id),
          referenceDocumentSerial: payment.inv_serial,
          referenceDocumentType: FA_DOC_TYPE.billingNote,
        },
      ], // required
    });
    const taxDoc = faDoc(taxFa);
    if (!taxDoc) {
      await client.query("rollback");
      return NextResponse.json({ error: "สร้างใบกำกับภาษีใน FlowAccount ไม่สำเร็จ", flowaccount: taxFa.data }, { status: 502 });
    }

    const tax = await client.query(
      `insert into tax_invoice (payment_id, tax_id, flowaccount_record_id, flowaccount_serial)
       values ($1, $2, $3, $4) returning *`,
      [payment_id, customer.tax_id ?? null, taxDoc.recordId, taxDoc.documentSerial],
    );

    // 2. ใบเสร็จ พร้อมบันทึกรับเงิน (เงินสด = 1, QR = โอนเงิน 5)
    const receiptFa = await flowAccount("POST", "/upgrade/receipts/with-payment", {
      ...common,
      creditType: 3,
      documentReference: [
        {
          recordId: taxDoc.recordId,
          referenceDocumentSerial: taxDoc.documentSerial,
          referenceDocumentType: FA_DOC_TYPE.taxInvoice,
        },
      ], // required
      paymentMethod: payment.pay_method === "cash" ? 1 : 5,
      // โอนเงินต้องระบุบัญชีธนาคารของร้านใน FlowAccount (GET /bank-channel/bank-accounts)
      ...(payment.pay_method === "cash" ? {} : { bankAccountId: Number(process.env.FLOWACCOUNT_BANK_ACCOUNT_ID) }),
      paymentDate: paidDate, // required
      collected: amount, // required
    });
    const receiptDoc = faDoc(receiptFa);
    if (!receiptDoc) {
      await client.query("rollback");
      return NextResponse.json({ error: "สร้างใบเสร็จใน FlowAccount ไม่สำเร็จ", flowaccount: receiptFa.data }, { status: 502 });
    }

    const receipt = await client.query(
      `insert into receipt (payment_id, flowaccount_record_id, flowaccount_serial) values ($1, $2, $3) returning *`,
      [payment_id, receiptDoc.recordId, receiptDoc.documentSerial],
    );

    // ออกใบเสร็จยอดคงเหลือแล้ว ระบบเปลี่ยนสถานะเป็น "ปิดงาน" (Activity Diagram 3-5, ขอบเขต 1.3.5.1)
    if (payment.invoice_type === "balance") {
      await client.query(
        `update job set status = 'closed' where quotation_id = (select quotation_id from invoice where invoice_id = $1)`,
        [payment.invoice_id],
      );
    }

    await client.query("commit");
    return NextResponse.json({ tax_invoice: tax.rows[0], receipt: receipt.rows[0] }, { status: 201 });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
