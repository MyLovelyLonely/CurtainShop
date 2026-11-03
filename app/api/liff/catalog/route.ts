// GET /api/liff/catalog   สินค้าทั้งหมดในแคตตาล็อกที่เปิดให้ลูกค้าเห็น (Use Case 2–3 หน้า /liff/catalog)
//   ตอบ { products: [{ product_id, name, base_price, price_unit, image_url, category, catalog, code, light_filter, colors, tags, pattern_type, orders }] }
//   orders = จำนวนครั้งที่สินค้าถูกใส่ในใบประเมินราคา + ใบเสนอราคา (ใช้จัด "ยอดนิยม")
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";

export async function GET(req: Request) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();

  const { rows } = await pool.query(
    `select p.product_id, p.name, p.base_price::float as base_price, p.price_unit, p.image_url, cg.name as category, ct.name as catalog,
            coalesce(p.details->>'code', p.description->>'code') as code,
            p.details->>'light_filter' as light_filter,
            p.details->>'pattern_type' as pattern_type,
            coalesce(p.details->'colors', '[]'::jsonb) as colors,
            coalesce(p.details->'tags', '[]'::jsonb) as tags,
            (select count(*) from price_estimate_item i where i.product_id = p.product_id)::int
              + (select count(*) from quotation_item i where i.product_id = p.product_id)::int as orders
       from product p
       join catalog ct on ct.catalog_id = p.catalog_id and ct.is_visible
       join category cg on cg.category_id = ct.category_id
      order by p.product_id`,
  );
  return NextResponse.json({ products: rows });
}
