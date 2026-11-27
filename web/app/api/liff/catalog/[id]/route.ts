// GET /api/liff/catalog/{product_id}   รายละเอียดสินค้า 1 ชิ้น (หน้า /liff/catalog/{id})
//   เฉพาะสินค้าในแคตตาล็อกที่เปิดให้ลูกค้าเห็น / description เก่าบางแถวเป็น JSON ไม่ใช่ข้อความ = ส่ง null
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });

  const { rows } = await pool.query(
    `select p.product_id, p.name, p.base_price::float as base_price, p.price_unit, p.image_url,
            case when jsonb_typeof(p.description) = 'string' then p.description #>> '{}' end as description,
            cg.name as category, ct.name as catalog, coalesce(p.details, '{}'::jsonb) as details
       from product p
       join catalog ct on ct.catalog_id = p.catalog_id and ct.is_visible
       join category cg on cg.category_id = ct.category_id
      where p.product_id = $1`,
    [Number(id)],
  );
  if (!rows[0]) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  return NextResponse.json({ product: rows[0] });
}
