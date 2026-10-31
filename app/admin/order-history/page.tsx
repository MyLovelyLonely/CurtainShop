// ประวัติการสั่งซื้อย้อนหลังของลูกค้า (Use Case 17)
import Link from "next/link";
import { Search } from "lucide-react";
import { pool } from "@/lib/db";
import { Badge, Card, EmptyState, JOB_STATUS, PageHeader, StatusBadge, Table, thDate } from "@/components/admin/ui";

type SearchParams = { q?: string; customer?: string };

export default async function OrderHistory({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const term = params.q?.trim() ?? "";
  const customerId = Number(params.customer);
  const selected = Number.isSafeInteger(customerId) && customerId > 0;

  const customers = await pool.query(
    `select c.customer_id, c.full_name, c.display_name, c.phone,
            count(distinct q.quotation_id)::int as order_count,
            max(q.created_at) as last_order_at
     from customer c
     join price_estimate e using (customer_id)
     join quotation q using (estimate_id)
     where q.confirmed_at is not null
       and ($1 = '' or c.full_name ilike $2
          or c.display_name ilike $2
          or c.phone ilike $2
          or q.details->'customer'->>'name' ilike $2)
     group by c.customer_id
     order by last_order_at desc`,
    [term, `%${term}%`],
  );

  const customer = selected
    ? await pool.query(
      `select c.customer_id, c.full_name, c.display_name, c.phone, c.address
       from customer c where c.customer_id = $1`,
      [customerId],
    )
    : null;

  const history = selected && customer?.rows[0]
    ? await pool.query(
      `select q.quotation_id, q.flowaccount_serial, q.created_at, q.confirmed_at,
              q.details->'customer'->>'name' as document_customer,
              j.status as job_status, j.started_at, j.completed_at,
              (select min(s.work_time) from job_schedule s where s.job_id = j.job_id) as installation_date,
              string_agg(distinct coalesce(cat.name, 'สินค้า') || ' - ' || p.name, ', ' order by coalesce(cat.name, 'สินค้า') || ' - ' || p.name) as products
       from price_estimate e
       join quotation q using (estimate_id)
       join quotation_item qi using (quotation_id)
       join product p using (product_id)
       left join catalog ca using (catalog_id)
       left join category cat using (category_id)
       left join job j using (quotation_id)
       where e.customer_id = $1 and q.confirmed_at is not null
       group by q.quotation_id, j.job_id
       order by q.created_at desc`,
      [customerId],
    )
    : null;

  return (
    <>
      <PageHeader title="ประวัติการสั่งซื้อย้อนหลัง" sub="ค้นหาลูกค้าเพื่อดูรายการสินค้าที่สั่งและวันติดตั้ง" />

      <Card>
        <form action="/admin/order-history" className="flex flex-col gap-3 p-4 sm:flex-row">
          <label htmlFor="customer-search" className="sr-only">ค้นหาชื่อลูกค้าหรือเบอร์โทร</label>
          <input id="customer-search" name="q" defaultValue={term}
            placeholder="ค้นหาชื่อลูกค้าหรือเบอร์โทร"
            className="min-w-0 flex-1 rounded-xl border-2 border-border bg-card px-4 py-3 text-base outline-none focus:border-primary" />
          <button type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground">
            <Search size={18} /> ค้นหาลูกค้า
          </button>
        </form>
      </Card>

      <Card title={`${term ? "ผลการค้นหา" : "ลูกค้าที่มีประวัติการสั่งซื้อ"} (${customers.rows.length})`}>
          <Table headers={["ลูกค้า", "เบอร์โทร", "รายการสั่งซื้อ", "สั่งซื้อล่าสุด"]}>
            {customers.rows.map((c) => (
              <tr key={c.customer_id}>
                <td>
                  <Link href={`/admin/order-history?${term ? `q=${encodeURIComponent(term)}&` : ""}customer=${c.customer_id}`}
                    className="font-semibold text-primary hover:underline">
                    {c.full_name || c.display_name || "ไม่ระบุชื่อ"}
                  </Link>
                  {c.full_name && c.display_name && c.full_name !== c.display_name && (
                    <span className="ml-2 text-sm text-muted-foreground">LINE: {c.display_name}</span>
                  )}
                </td>
                <td>{c.phone || "-"}</td>
                <td>{c.order_count} ใบเสนอราคา</td>
                <td>{thDate(c.last_order_at)}</td>
              </tr>
            ))}
          </Table>
          {!customers.rows.length && (
            <p className="px-4 pb-4 text-center text-sm text-muted-foreground">
              {term ? "ไม่พบข้อมูลลูกค้า" : "ยังไม่มีลูกค้าที่มีประวัติการสั่งซื้อ"}
            </p>
          )}
      </Card>

      {selected && customer?.rows[0] && history && (
        <>
          <Card title="ข้อมูลลูกค้า">
            <div className="grid gap-2 p-4 text-sm sm:grid-cols-2">
              <p><span className="text-muted-foreground">ชื่อ:</span> {customer.rows[0].full_name || customer.rows[0].display_name || "-"}</p>
              <p><span className="text-muted-foreground">ชื่อ LINE:</span> {customer.rows[0].display_name || "-"}</p>
              <p><span className="text-muted-foreground">เบอร์โทร:</span> {customer.rows[0].phone || "-"}</p>
              <p><span className="text-muted-foreground">ที่อยู่:</span> {customer.rows[0].address || "-"}</p>
            </div>
          </Card>

          <Card title={`ประวัติการสั่งซื้อ (${history.rows.length})`}>
            <Table headers={["วันที่สั่งซื้อ", "ใบเสนอราคา", "สินค้าที่สั่ง", "วันติดตั้ง", "วันเสร็จ", "สถานะงาน"]}>
              {history.rows.map((order) => (
                <tr key={order.quotation_id}>
                  <td className="whitespace-nowrap">{thDate(order.created_at)}</td>
                  <td>
                    <Link href={`/admin/quotations/${order.quotation_id}`} className="font-mono text-primary hover:underline">
                      {order.flowaccount_serial ?? `#${order.quotation_id}`}
                    </Link>
                  </td>
                  <td className="min-w-56">{order.products}</td>
                  <td className="whitespace-nowrap">{thDate(order.installation_date, true)}</td>
                  <td className="whitespace-nowrap">{thDate(order.completed_at, true)}</td>
                  <td>
                    {order.job_status
                      ? <StatusBadge map={JOB_STATUS} status={order.job_status} />
                      : <Badge color="amber">ยังไม่มีงาน</Badge>}
                  </td>
                </tr>
              ))}
            </Table>
            {!history.rows.length && <p className="px-4 pb-4 text-center text-sm text-muted-foreground">ลูกค้ารายนี้ยังไม่มีประวัติการสั่งซื้อ</p>}
          </Card>
        </>
      )}

      {selected && !customer?.rows[0] && (
        <EmptyState>ไม่พบข้อมูลลูกค้า</EmptyState>
      )}
    </>
  );
}
