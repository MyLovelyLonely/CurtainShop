// ใบสัญญาซื้อขาย (Use Case 15 ข้อ 3, Activity Diagram 3-4)
//   บน: ใบเสนอราคาที่ลูกค้ายืนยันแล้วแต่ยังไม่ส่งสัญญา -> แนบ PDF ที่ร้านเซ็นแล้ว ส่งให้ลูกค้า
//   ล่าง: สัญญาทั้งหมด เรียงที่รอตรวจสอบขึ้นก่อน
import Link from "next/link";
import { Eye } from "lucide-react";
import { pool } from "@/lib/db";
import { contractNo } from "@/lib/shop";
import { CONTRACT_BADGE, contractStatus } from "@/lib/contract";
import { SendContractForm } from "@/components/admin/SendContractForm";
import { Badge, Card, PageHeader, Table, thDate } from "@/components/admin/ui";

export default async function Contracts() {
  const [toSend, contracts] = await Promise.all([
    pool.query(`
      select q.quotation_id, q.flowaccount_serial as qt_serial, q.confirmed_at,
             q.details->'customer'->>'name' as customer
      from quotation q
      where q.confirmed_at is not null
        and not exists (select 1 from contract ct where ct.quotation_id = q.quotation_id)
      order by q.confirmed_at`),
    pool.query(`
      select ct.*, q.flowaccount_serial as qt_serial, q.details->'customer'->>'name' as customer,
             q.details->'contract_reject' as reject
      from contract ct join quotation q using (quotation_id)
      order by (ct.signed_file_url is not null and ct.signed_at is null) desc, ct.created_at desc`),
  ]);

  return (
    <>
      <PageHeader title="ใบสัญญาซื้อขาย" sub={`ทั้งหมด ${contracts.rows.length} ฉบับ`} />

      <Card title={`รอส่งใบสัญญา (${toSend.rows.length})`} size="lg">
        <Table size="lg" headers={["ลูกค้า", "ใบเสนอราคา", "ยืนยันเมื่อ", "แนบ PDF ที่ร้านเซ็นแล้ว"]} empty={!toSend.rows.length}>
          {toSend.rows.map((q) => (
            <tr key={q.quotation_id}>
              <td className="font-medium">{q.customer}</td>
              <td className="font-mono">
                <Link href={`/admin/quotations/${q.quotation_id}`} className="text-primary hover:underline">{q.qt_serial ?? `#${q.quotation_id}`}</Link>
              </td>
              <td className="text-muted-foreground">{thDate(q.confirmed_at)}</td>
              <td><SendContractForm quotationId={q.quotation_id} /></td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="ใบสัญญาทั้งหมด" size="lg">
        <Table size="lg" headers={["เลขที่", "ลูกค้า", "ใบเสนอราคา", "ส่งเมื่อ", "สถานะ", ""]} empty={!contracts.rows.length}>
          {contracts.rows.map((ct) => {
            const status = contractStatus(ct);
            const [label, color] = CONTRACT_BADGE[status];
            return (
              <tr key={ct.contract_id}>
                <td className="font-mono">{contractNo(ct)}</td>
                <td>{ct.customer}</td>
                <td className="font-mono">{ct.qt_serial ?? `#${ct.quotation_id}`}</td>
                <td className="text-muted-foreground">{thDate(ct.created_at, true)}</td>
                <td>
                  <Badge color={color} size="lg">{label}</Badge>
                  {status === "waiting_sign" && ct.reject && <p className="text-sm text-red-700 mt-1">ตีกลับ: {ct.reject.note}</p>}
                </td>
                <td className="text-right">
                  <Link
                    href={`/admin/contracts/${ct.contract_id}`}
                    title={status === "waiting_review" ? "ตรวจสอบใบสัญญา" : "ดูใบสัญญา"}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm font-medium transition hover:border-primary hover:text-primary"
                  >
                    <Eye size={15} />
                    {status === "waiting_review" ? "ตรวจสอบ" : "ดู"}
                  </Link>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
