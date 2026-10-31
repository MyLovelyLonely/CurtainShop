// รายละเอียดใบเสนอราคา
// ตัวหนังสือใหญ่ อ่านง่าย
import { notFound } from "next/navigation";
import { MapPin, Phone } from "lucide-react";
import { pool } from "@/lib/db";
import { lineArea, lineTotal } from "@/lib/pricing";
import { DocLinks } from "@/components/admin/DocLinks";
import { Badge, baht, ButtonLink, Card, PageHeader, Table, thDate } from "@/components/admin/ui";

export default async function QuotationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await pool.query(
    `select q.*, a.full_name as admin_name from quotation q join admin a using (admin_id) where quotation_id = $1`, [id]);
  const quotation = q.rows[0];
  if (!quotation) notFound();

  const [items, invoices] = await Promise.all([
    pool.query(`select qi.*, p.name, p.price_unit from quotation_item qi join product p using (product_id)
                where quotation_id = $1 order by quotation_item_id`, [id]),
    pool.query(`select invoice_id from invoice where quotation_id = $1 limit 1`, [id]),
  ]);

  const c = quotation.details.customer;
  // รายการเก็บเป็นยอดต่อ 1 ห้อง ยอดก่อน VAT = รวมต่อห้อง x จำนวนห้อง
  const roomSubTotal = items.rows.reduce((s, i) => s + lineTotal(i, i.price_unit), 0);
  const rooms = Number(quotation.details.room_count) || 1; // ใบเก่าที่ยังไม่มี room_count = 1 ห้อง
  const subTotal = Math.round(roomSubTotal * rooms * 100) / 100;
  const total = Number(quotation.total_amount);
  const deposit = Number(quotation.deposit_amount);
  // แก้ไขได้เฉพาะเมื่อลูกค้าแจ้งแก้ไขมา ก่อนลูกค้ายืนยันและก่อนออกใบแจ้งหนี้ (Use Case 15 Alternate Flow)
  const waiting = !quotation.confirmed_at && !invoices.rows.length;
  const changeRequest = waiting ? quotation.details.change_request : null;

  return (
    <>
      <PageHeader title={`ใบเสนอราคา ${quotation.flowaccount_serial ?? `#${quotation.quotation_id}`}`}
        sub={`จัดทำโดย ${quotation.admin_name} · ${thDate(quotation.created_at)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <DocLinks docType="quotations" recordId={quotation.flowaccount_record_id} serial={quotation.flowaccount_serial} size="lg" />
          {quotation.details.want_tax_invoice && <Badge color="purple" size="lg">ขอใบกำกับภาษี</Badge>}
          {/* สถานะของใบเสนอราคาเท่านั้น (quotation.confirmed_at) */}
          {quotation.confirmed_at
            ? <Badge color="emerald" size="lg">ลูกค้ายืนยันแล้ว {thDate(quotation.confirmed_at)}</Badge>
            : <Badge color="amber" size="lg">รอลูกค้ายืนยัน</Badge>}
          {quotation.details.revised_at && <Badge color="gray" size="lg">แก้ไขล่าสุด {thDate(quotation.details.revised_at, true)}</Badge>}
        </div>
      </PageHeader>

      {/* ลูกค้าแจ้งว่าข้อมูลไม่ถูกต้อง -> แก้ไข แล้วให้ลูกค้าตรวจสอบอีกครั้ง (Activity Diagram 3-4) */}
      {changeRequest ? (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 border-2 border-amber-200 rounded-xl px-5 py-4">
          <div className="text-base text-amber-900">
            <p className="font-semibold">ลูกค้าแจ้งแก้ไข {thDate(changeRequest.requested_at, true)}</p>
            <p>“{changeRequest.note}”</p>
          </div>
          <ButtonLink href={`/admin/quotations/${quotation.quotation_id}/edit`} variant="outline">แก้ไขใบเสนอราคา</ButtonLink>
        </div>
      ) : waiting && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl px-5 py-4 text-base text-amber-900">
          รอลูกค้าตรวจสอบและยืนยันผ่าน LINE · แก้ไขได้เมื่อลูกค้าแจ้งว่าข้อมูลไม่ถูกต้องเท่านั้น
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title={rooms > 1 ? `รายการสินค้าต่อ 1 ห้อง (${rooms} ห้อง)` : "รายการสินค้า"} className="lg:col-span-2" size="lg">
          <Table size="lg" headers={["สินค้า", "ขนาด (กว้าง × สูง)", "จำนวน", "ราคา/หน่วย", "รวม"]}>
            {items.rows.map((i) => {
              const area = lineArea(i, i.price_unit);
              return (
                <tr key={i.quotation_item_id}>
                  <td className="font-medium">{i.name}</td>
                  <td>{i.width && i.height ? `${Number(i.width)} × ${Number(i.height)} ม.` : "-"}</td>
                  <td>
                    {area === null ? `${i.quantity} ${i.price_unit}` : (
                      <>
                        {i.quantity} หน้าต่าง
                        <span className="block text-sm text-muted-foreground">{area.toFixed(2)} ตร.ม.</span>
                      </>
                    )}
                  </td>
                  <td className="font-mono whitespace-nowrap">{baht(i.unit_price)}<span className="text-sm text-muted-foreground"> / {i.price_unit}</span></td>
                  <td className="font-mono font-semibold whitespace-nowrap">{baht(lineTotal(i, i.price_unit))}</td>
                </tr>
              );
            })}
          </Table>
        </Card>

        <div className="space-y-4">
          <Card title="ลูกค้า" size="lg">
            <div className="px-5 pb-5 space-y-2 text-base">
              <p className="text-xl font-semibold">{c.name}</p>
              {c.phone && (
                <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-primary font-medium hover:underline">
                  <Phone size={17} /> {c.phone}
                </a>
              )}
              {c.address && <p className="flex items-start gap-2"><MapPin size={17} className="text-muted-foreground mt-1 shrink-0" /> {c.address}</p>}
              {c.tax_id && <p>เลขผู้เสียภาษี <span className="font-mono">{c.tax_id}</span></p>}
              {quotation.details.project_name && <p className="text-muted-foreground">{quotation.details.project_name}</p>}
            </div>
          </Card>

          <Card title="สรุปยอดเงิน" size="lg">
            <div className="px-5 pb-5 space-y-2 text-base">
              {rooms > 1 && <Row label="รวมต่อ 1 ห้อง" value={baht(roomSubTotal)} />}
              {rooms > 1 && <Row label="จำนวนห้อง" value={`× ${rooms}`} />}
              <Row label="ยอดก่อน VAT" value={baht(subTotal)} />
              <Row label="VAT 7%" value={baht(total - subTotal)} />
              <div className="flex justify-between items-baseline border-t-2 border-border pt-3 mt-1">
                <span className="text-lg font-semibold">รวมทั้งสิ้น</span>
                <span className="text-2xl font-bold font-mono text-primary">{baht(total)}</span>
              </div>
              <Row label="มัดจำ (ชำระก่อน)" value={baht(deposit)} />
              <Row label="คงเหลือ (ชำระหลังติดตั้ง)" value={baht(total - deposit)} />
            </div>
          </Card>
        </div>
      </div>

    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
