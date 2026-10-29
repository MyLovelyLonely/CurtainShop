// POST /api/admin/quotations   สร้างใบเสนอราคา: บันทึกลงฐานข้อมูล + สร้างใน FlowAccount
// body: { estimate_id, admin_id, items?, project_name?, want_tax_invoice? }
//   items = [{ item_id, width, height, quantity }] ขนาดหน้างานจริงต่อรายการในใบประเมิน (Use Case 12)
//     แอดมินแก้ได้แค่ กว้าง / สูง / จำนวนหน้าต่างต่อห้อง ไม่ส่ง = ใช้ค่าจากใบประเมินราคา
//   สินค้า ราคาต่อหน่วย (base_price) จำนวนห้อง (room_count) และมัดจำ 50% ระบบกำหนดเอง แก้ไม่ได้ (lib/quotation.ts)
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowAccount } from "@/lib/flowaccount";
import { faDoc } from "@/lib/documents";
import { faQuotationBody, priceItems, type SizeEdit } from "@/lib/quotation";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { estimate_id, admin_id } = body;
  if (!estimate_id || !admin_id) {
    return NextResponse.json({ error: "ต้องส่ง estimate_id และ admin_id" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // ลูกค้าและจำนวนห้องของใบประเมินราคา
    const customerRes = await client.query(
      `select c.*, e.room_count from price_estimate e join customer c using (customer_id) where e.estimate_id = $1`,
      [estimate_id],
    );
    const customer = customerRes.rows[0];
    if (!customer) return NextResponse.json({ error: "ไม่พบใบประเมินราคา" }, { status: 404 });
    const roomCount = Number(customer.room_count) || 1;

    // รายการสินค้าและราคาดึงจากใบประเมินราคา + สินค้า (ไม่รับจากฟอร์ม)
    const est = await client.query(
      `select i.item_id as id, i.product_id, i.width, i.height, i.quantity,
              p.name, p.base_price, p.price_unit, p.details as product_details
       from price_estimate_item i join product p using (product_id)
       where i.estimate_id = $1 order by i.item_id`,
      [estimate_id],
    );
    if (!est.rowCount) return NextResponse.json({ error: "ไม่มีรายการสินค้า" }, { status: 400 });

    // ขนาดหน้างานจริงที่แอดมินกรอก
    const edits = new Map<number, SizeEdit>(((body.items ?? []) as (SizeEdit & { item_id: number })[]).map((i) => [Number(i.item_id), i]));
    const priced = priceItems(est.rows, edits, roomCount);
    if (priced.error !== null) return NextResponse.json({ error: priced.error }, { status: 400 });

    // ชื่อบนเอกสารใช้ชื่อ-นามสกุลจริง (contactName เป็นฟิลด์บังคับของ FlowAccount)
    if (!customer.full_name) return NextResponse.json({ error: "ลูกค้ายังไม่มีชื่อ-นามสกุล (full_name)" }, { status: 400 });
    const snapshot = { name: customer.full_name, phone: customer.phone, address: customer.address, ...customer.details };
    const details = {
      project_name: body.project_name ?? null,
      room_count: roomCount, // quotation_item เก็บยอดต่อ 1 ห้อง ยอดรวม = รวมต่อห้อง x room_count
      want_tax_invoice: body.want_tax_invoice === true, // ลูกค้าขอใบกำกับภาษี (ส่งให้ลูกค้าเฉพาะคนที่ขอ)
      customer: snapshot, // สำเนาข้อมูลลูกค้า ณ วันออกเอกสาร
    };

    await client.query("begin");

    const q = await client.query(
      `insert into quotation (estimate_id, admin_id, total_amount, deposit_amount, details)
       values ($1, $2, $3, $4, $5) returning *`,
      [estimate_id, admin_id, priced.grandTotal, priced.depositAmount, details],
    );
    const quotation = q.rows[0];

    for (const i of priced.items) {
      await client.query(
        `insert into quotation_item (quotation_id, product_id, width, height, quantity, unit_price)
         values ($1, $2, $3, $4, $5, $6)`,
        [quotation.quotation_id, i.product_id, i.width ?? null, i.height ?? null, i.quantity, i.unit_price],
      );
    }

    // สร้างใน FlowAccount (SimpleDocument)
    const fa = await flowAccount("POST", "/quotations", faQuotationBody({
      customer: snapshot, projectName: details.project_name, reference: `Q${quotation.quotation_id}`, roomCount, ...priced,
    }));
    const doc = faDoc(fa);
    if (!doc) {
      await client.query("rollback");
      return NextResponse.json({ error: "สร้างใน FlowAccount ไม่สำเร็จ", flowaccount: fa.data }, { status: 502 });
    }

    const updated = await client.query(
      `update quotation set flowaccount_record_id = $1, flowaccount_serial = $2
       where quotation_id = $3 returning *`,
      [doc.recordId, doc.documentSerial, quotation.quotation_id],
    );

    await client.query("commit");
    return NextResponse.json({ quotation: updated.rows[0] }, { status: 201 });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
