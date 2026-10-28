// Catalog: แคตตาล็อกและสินค้า (Use Case 13)
import { pool } from "@/lib/db";
import { Badge, baht, Card, PageHeader, Table } from "@/components/admin/ui";

export default async function Catalog() {
  const [catalogs, products] = await Promise.all([
    pool.query(`
      select c.*, cat.name as category, (select count(*)::int from product p where p.catalog_id = c.catalog_id) as product_count
      from catalog c join category cat using (category_id) order by c.catalog_id`),
    pool.query(`
      select p.*, c.name as catalog,
             exists (select 1 from vector_embedding v where v.product_id = p.product_id) as has_embedding
      from product p join catalog c using (catalog_id) order by p.product_id`),
  ]);

  return (
    <>
      <PageHeader title="Catalog" sub={`${catalogs.rows.length} เล่ม · ${products.rows.length} สินค้า`} />

      <Card title="แคตตาล็อก">
        <Table headers={["ชื่อ", "หมวดหมู่", "สินค้า", "ไฟล์", "การแสดงผล"]} empty={!catalogs.rows.length}>
          {catalogs.rows.map((c) => (
            <tr key={c.catalog_id}>
              <td className="font-medium">{c.name}</td>
              <td>{c.category}</td>
              <td className="font-mono">{c.product_count}</td>
              <td>{c.file_url ? <a href={c.file_url} target="_blank" className="text-primary text-xs hover:underline">เปิดไฟล์</a> : "-"}</td>
              <td>{c.is_visible ? <Badge color="emerald">แสดง</Badge> : <Badge>ซ่อน</Badge>}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="สินค้า">
        <Table headers={["รหัส", "ชื่อสินค้า", "แคตตาล็อก", "สี / ชนิดผ้า", "ราคา", "ค้นหาด้วย AI"]} empty={!products.rows.length}>
          {products.rows.map((p) => (
            <tr key={p.product_id}>
              <td className="font-mono text-xs">{p.description?.code ?? p.product_id}</td>
              <td className="font-medium">{p.name}</td>
              <td className="text-muted-foreground">{p.catalog}</td>
              <td className="text-muted-foreground">{[p.description?.color, p.description?.fabric].filter(Boolean).join(" · ") || "-"}</td>
              <td className="font-mono whitespace-nowrap">{baht(p.base_price)} / {p.price_unit}</td>
              <td>{p.has_embedding ? <Badge color="emerald">พร้อม</Badge> : <Badge color="amber">ยังไม่มีเวกเตอร์</Badge>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
