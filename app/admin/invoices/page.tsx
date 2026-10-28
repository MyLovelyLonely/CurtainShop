// ออกบิล / ใบเสร็จ: ใบแจ้งหนี้ทั้งหมด + การชำระที่ paid แล้วแต่ยังไม่ออกใบเสร็จ
import Link from "next/link";
import { pool } from "@/lib/db";
import { ActionButton } from "@/components/admin/ActionButton";
import { Badge, baht, Card, PageHeader, PAYMENT_STATUS, StatusBadge, Table, thDate } from "@/components/admin/ui";

export default async function Invoices() {
  const [invoices, waiting] = await Promise.all([
    pool.query(`
      select i.*, q.quotation_id, q.flowaccount_serial as qt_serial, q.details->'customer'->>'name' as customer,
             (select p.status from payment p where p.invoice_id = i.invoice_id
              order by (p.status = 'paid') desc, p.payment_id desc limit 1) as pay_status
      from invoice i join quotation q using (quotation_id)
      order by i.invoice_id desc`),
    pool.query(`
      select p.*, i.flowaccount_serial as inv_serial, q.details->'customer'->>'name' as customer
      from payment p join invoice i using (invoice_id) join quotation q using (quotation_id)
      where p.status = 'paid' and not exists (select 1 from receipt r where r.payment_id = p.payment_id)
      order by p.paid_at`),
  ]);

  const paid = invoices.rows.filter((i) => i.pay_status === "paid");
  const sum = (rows: { amount: string }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <>
      <PageHeader title="ออกบิล / ใบเสร็จ" sub={`ใบแจ้งหนี้ ${invoices.rows.length} ใบ`} />

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-emerald-700 text-xs font-medium">ชำระแล้ว</p>
          <p className="text-emerald-800 text-xl font-bold font-mono">{baht(sum(paid))}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-amber-700 text-xs font-medium">รอชำระ</p>
          <p className="text-amber-800 text-xl font-bold font-mono">{baht(sum(invoices.rows) - sum(paid))}</p>
        </div>
      </div>

      <Card title={`รอออกใบเสร็จ / ใบกำกับภาษี (${waiting.rows.length})`}>
        <Table headers={["ลูกค้า", "ใบแจ้งหนี้", "ยอดที่ชำระ", "วิธีชำระ", "วันที่ชำระ", ""]} empty={!waiting.rows.length}>
          {waiting.rows.map((p) => (
            <tr key={p.payment_id}>
              <td>{p.customer}</td>
              <td className="font-mono text-xs">{p.inv_serial}</td>
              <td className="font-mono">{baht(p.amount)}</td>
              <td>{p.pay_method === "cash" ? "เงินสด" : "QR Code"}</td>
              <td className="text-muted-foreground">{thDate(p.paid_at, true)}</td>
              <td className="text-right"><ActionButton url="/api/admin/receipts" body={{ payment_id: p.payment_id }} label="ออกใบเสร็จ / ใบกำกับภาษี" /></td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="ใบแจ้งหนี้ทั้งหมด">
        <Table headers={["เลขที่", "ลูกค้า", "ใบเสนอราคา", "ประเภท", "ยอด", "ครบกำหนด", "สถานะ"]} empty={!invoices.rows.length}>
          {invoices.rows.map((i) => (
            <tr key={i.invoice_id} className="hover:bg-muted/30">
              <td className="font-mono text-xs">{i.flowaccount_serial ?? `#${i.invoice_id}`}</td>
              <td>{i.customer}</td>
              <td className="font-mono text-xs">
                <Link href={`/admin/quotations/${i.quotation_id}`} className="text-primary hover:underline">{i.qt_serial ?? `#${i.quotation_id}`}</Link>
              </td>
              <td>{i.type === "deposit" ? "มัดจำ" : "ยอดคงเหลือ"}</td>
              <td className="font-mono">{baht(i.amount)}</td>
              <td className="text-muted-foreground">{thDate(i.due_date)}</td>
              <td>{i.pay_status ? <StatusBadge map={PAYMENT_STATUS} status={i.pay_status} /> : <Badge color="amber">รอชำระ</Badge>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
