// GET /api/admin/quotations/{quotation_id}   ดูใบเสนอราคา: ข้อมูลในฐานข้อมูล + เอกสารจาก FlowAccount
// PUT /api/admin/quotations/{quotation_id}   แก้ไขใบเสนอราคา เมื่อลูกค้าแจ้งว่าข้อมูลไม่ถูกต้อง (Use Case 15 Alternate Flow)
//   body: { items: [{ quotation_item_id, width, height, quantity }], project_name? }
//   แก้ได้เฉพาะก่อนลูกค้ายืนยัน และยังไม่ออกใบแจ้งหนี้ (Activity Diagram 3-4)
//   เพราะ FlowAccount แก้ได้เฉพาะเอกสารสถานะ "รออนุมัติ" และลูกค้ายืนยันยอดไปแล้ว
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowAccount } from "@/lib/flowaccount";
import { faDoc } from "@/lib/documents";
import { faQuotationBody, priceItems, type SizeEdit } from "@/lib/quotation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const q = await pool.query(`select * from quotation where quotation_id = $1`, [id]);
    const quotation = q.rows[0];
    if (!quotation) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });

    const items = await pool.query(
      `select qi.*, p.name as product_name
       from quotation_item qi join product p using (product_id)
       where qi.quotation_id = $1 order by qi.quotation_item_id`,
      [id],
    );

    // ดึงเอกสารจาก FlowAccount ด้วย recordId ที่บันทึกไว้
    const fa = quotation.flowaccount_record_id
      ? await flowAccount("GET", `/quotations/${quotation.flowaccount_record_id}`)
      : null;

    return NextResponse.json({ quotation, items: items.rows, flowaccount: fa?.data ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const client = await pool.connect();
  try {
    const q = await client.query(
      `select q.*, exists (select 1 from invoice i where i.quotation_id = q.quotation_id) as has_invoice
       from quotation q where quotation_id = $1`, [id]);
    const quotation = q.rows[0];
    if (!quotation) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
    if (quotation.confirmed_at) return NextResponse.json({ error: "ลูกค้ายืนยันใบเสนอราคาแล้ว แก้ไขไม่ได้" }, { status: 409 });
    if (quotation.has_invoice) return NextResponse.json({ error: "ออกใบแจ้งหนี้แล้ว แก้ไขใบเสนอราคาไม่ได้" }, { status: 409 });
    if (!quotation.flowaccount_record_id) return NextResponse.json({ error: "ใบเสนอราคายังไม่มีใน FlowAccount" }, { status: 400 });

    // รายการเดิม + ราคาปัจจุบันของสินค้า (ราคาต่อหน่วยดึงใหม่จากสินค้า ไม่รับจากฟอร์ม)
    const rows = await client.query(
      `select qi.quotation_item_id as id, qi.product_id, qi.width, qi.height, qi.quantity,
              p.name, p.base_price, p.price_unit, p.details as product_details
       from quotation_item qi join product p using (product_id)
       where qi.quotation_id = $1 order by qi.quotation_item_id`,
      [id],
    );
    const roomCount = Number(quotation.details.room_count) || 1;
    const edits = new Map<number, SizeEdit>(
      ((body.items ?? []) as (SizeEdit & { quotation_item_id: number })[]).map((i) => [Number(i.quotation_item_id), i]),
    );
    const priced = priceItems(rows.rows, edits, roomCount);
    if (priced.error !== null) return NextResponse.json({ error: priced.error }, { status: 400 });

    const details = {
      ...quotation.details,
      project_name: body.project_name !== undefined ? body.project_name || null : quotation.details.project_name,
      revised_at: new Date().toISOString(), // แก้ไขล่าสุด ให้ลูกค้ารู้ว่าเป็นฉบับแก้ไข
    };

    await client.query("begin");
    for (const i of priced.items) {
      await client.query(
        `update quotation_item set width = $1, height = $2, quantity = $3, unit_price = $4 where quotation_item_id = $5`,
        [i.width ?? null, i.height ?? null, i.quantity, i.unit_price, i.id],
      );
    }
    const updated = await client.query(
      `update quotation set total_amount = $1, deposit_amount = $2, details = $3 where quotation_id = $4 returning *`,
      [priced.grandTotal, priced.depositAmount, details, id],
    );

    // แก้เอกสารเดิมใน FlowAccount (เลขที่เอกสารเดิม)
    const fa = await flowAccount("PUT", `/quotations/${quotation.flowaccount_record_id}`, faQuotationBody({
      recordId: Number(quotation.flowaccount_record_id), customer: quotation.details.customer,
      projectName: details.project_name, reference: `Q${quotation.quotation_id}`, roomCount, ...priced,
    }));
    if (!faDoc(fa)) {
      await client.query("rollback");
      return NextResponse.json({ error: "แก้ไขใน FlowAccount ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", flowaccount: fa.data }, { status: 502 });
    }

    await client.query("commit");
    // TODO: แจ้งลูกค้าทาง LINE OA ให้ตรวจสอบใบเสนอราคาอีกครั้ง (Use Case 15 Alternate Flow)
    return NextResponse.json({ quotation: updated.rows[0] });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
