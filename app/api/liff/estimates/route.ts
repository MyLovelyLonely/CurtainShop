// POST /api/liff/estimates   ลูกค้าส่งใบประเมินราคา (Use Case 4-5) -> แอดมินเห็นในหน้าใบประเมินราคา
// body: { items: [{ product_id, width, height, quantity }], room_count?, method?, billing }
//   ราคาต่อหน่วยดึงจากตาราง product เสมอ ไม่รับราคาจากหน้าเว็บ (คำนวณด้วย priceItems เดียวกับใบเสนอราคา)
//   billing = ข้อมูลลูกค้าบนเอกสาร (บุคคลธรรมดา / นิติบุคคล) เก็บใน price_estimate.details.billing
//     ไม่แก้ข้อมูลของฉัน (ตาราง customer) แอดมินทำใบเสนอราคาเมื่อไร ระบบคัดลอกไป quotation.details.customer
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { priceItems } from "@/lib/quotation";
import { parseEstimateBuyer } from "@/lib/buyer";

export async function POST(req: Request) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const input: { product_id: number; width?: number | null; height?: number | null; quantity?: number }[] = Array.isArray(body.items) ? body.items : [];
  if (!input.length) return NextResponse.json({ error: "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ" }, { status: 400 });
  const roomCount = Number(body.room_count) || 1;
  const method = body.method === "ai" ? "ai" : "manual";

  const buyer = parseEstimateBuyer(body.billing);
  if (buyer.error) return NextResponse.json({ error: buyer.error }, { status: 400 });

  const client = await pool.connect();
  try {
    const products = await client.query(
      `select product_id, name, base_price, price_unit, details as product_details from product where product_id = any($1::int[])`,
      [input.map((i) => Number(i.product_id))],
    );
    const byId = new Map(products.rows.map((p) => [p.product_id, p]));
    const missing = input.filter((i) => !byId.has(Number(i.product_id)));
    if (missing.length) return NextResponse.json({ error: "ไม่พบสินค้าบางรายการ กรุณาเลือกใหม่" }, { status: 400 });

    // ใช้สูตรเดียวกับใบเสนอราคา: เช็กกว้าง/สูง/จำนวน แล้วคิดยอดรวม VAT
    const rows = input.map((i, idx) => ({
      ...byId.get(Number(i.product_id)), id: idx,
      width: i.width ?? null, height: i.height ?? null, quantity: Number(i.quantity ?? 1),
    }));
    const priced = priceItems(rows, new Map(), roomCount);
    if (priced.error !== null) return NextResponse.json({ error: priced.error }, { status: 400 });

    await client.query("begin");
    const e = await client.query(
      `insert into price_estimate (customer_id, method, total_price, room_count, details)
       values ($1, $2, $3, $4, $5) returning *`,
      [c.customer_id, method, priced.grandTotal, roomCount, { billing: buyer.values }],
    );
    const estimate = e.rows[0];
    for (const i of priced.items) {
      // width / height ในตารางห้ามว่าง: อุปกรณ์ (ชุด/ชิ้น) เก็บเป็น 0
      await client.query(
        `insert into price_estimate_item (estimate_id, product_id, width, height, quantity) values ($1, $2, $3, $4, $5)`,
        [estimate.estimate_id, i.product_id, i.width ?? 0, i.height ?? 0, i.windows],
      );
    }
    await client.query("commit");
    return NextResponse.json({ estimate }, { status: 201 });
  } catch (err) {
    await client.query("rollback").catch(() => {});
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
