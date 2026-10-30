// รายละเอียดใบเสนอราคา + เอกสารที่ต่อจากใบนี้ (ใบแจ้งหนี้ -> การชำระเงิน -> ใบกำกับภาษี/ใบเสร็จ)
// ตัวหนังสือใหญ่ อ่านง่าย
import { notFound } from "next/navigation";
import { MapPin, Phone } from "lucide-react";
import { pool } from "@/lib/db";
import { lineArea, lineTotal } from "@/lib/pricing";
import { ActionButton } from "@/components/admin/ActionButton";
import { CashPaymentForm } from "@/components/admin/CashPaymentForm";
import { DocLinks } from "@/components/admin/DocLinks";
import { Badge, baht, ButtonLink, Card, JOB_STATUS, PageHeader, PAYMENT_STATUS, StatusBadge, Table, thDate } from "@/components/admin/ui";
import { contractNo } from "@/lib/shop";

export default async function QuotationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await pool.query(
    `select q.*, a.full_name as admin_name from quotation q join admin a using (admin_id) where quotation_id = $1`, [id]);
  const quotation = q.rows[0];
  if (!quotation) notFound();

  const [items, invoices, payments, job, contract] = await Promise.all([
    pool.query(`select qi.*, p.name, p.price_unit from quotation_item qi join product p using (product_id)
                where quotation_id = $1 order by quotation_item_id`, [id]),
    pool.query(`select * from invoice where quotation_id = $1 order by invoice_id`, [id]),
    pool.query(`select p.*, r.receipt_id, r.flowaccount_serial as receipt_serial, r.flowaccount_record_id as receipt_record_id,
                       t.tax_invoice_id, t.flowaccount_serial as tax_serial, t.flowaccount_record_id as tax_record_id
                from payment p join invoice i using (invoice_id)
                left join receipt r using (payment_id) left join tax_invoice t using (payment_id)
                where i.quotation_id = $1 order by p.payment_id`, [id]),
    pool.query(`select * from job where quotation_id = $1`, [id]),
    pool.query(`select * from contract where quotation_id = $1`, [id]),
  ]);

  const c = quotation.details.customer;
  const inv = (type: string) => invoices.rows.find((i) => i.type === type);
  const paidFor = (invoiceId: number) => payments.rows.some((p) => p.invoice_id === invoiceId && p.status === "paid");
  // รายการเก็บเป็นยอดต่อ 1 ห้อง ยอดก่อน VAT = รวมต่อห้อง x จำนวนห้อง
  const roomSubTotal = items.rows.reduce((s, i) => s + lineTotal(i, i.price_unit), 0);
  const jobRow = job.rows[0];
  const rooms = Number(quotation.details.room_count) || 1; // ใบเก่าที่ยังไม่มี room_count = 1 ห้อง
  const subTotal = Math.round(roomSubTotal * rooms * 100) / 100;
  const total = Number(quotation.total_amount);
  const deposit = Number(quotation.deposit_amount);
  const contractRow = contract.rows[0];
  // แก้ไขได้เฉพาะเมื่อลูกค้าแจ้งแก้ไขมา ก่อนลูกค้ายืนยันและก่อนออกใบแจ้งหนี้ (Use Case 15 Alternate Flow)
  const waiting = !quotation.confirmed_at && !invoices.rows.length;
  const changeRequest = waiting ? quotation.details.change_request : null;

  // สถานะแยกตามตารางในฐานข้อมูล ไม่รวมเป็นเส้นเดียว:
  //   หัวหน้า = ใบเสนอราคา (confirmed_at), การ์ดใบแจ้งหนี้/การชำระ = payment.status, การ์ดสถานะงาน = job.status
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

      <Card title="สถานะงาน" size="lg">
        <div className="px-5 pb-5 flex flex-wrap items-center gap-4 text-base">
          {jobRow ? (
            <>
              <StatusBadge map={JOB_STATUS} status={jobRow.status} size="lg" />
              <span className="text-muted-foreground">
                {jobRow.started_at && `เริ่ม ${thDate(jobRow.started_at, true)}`}
                {jobRow.completed_at && ` · เสร็จ ${thDate(jobRow.completed_at, true)}`}
              </span>
              <div className="ml-auto flex gap-3">
                {jobRow.status === "pending" && (
                  <ActionButton size="lg" url={`/api/admin/jobs/${jobRow.job_id}/status`} body={{ status: "in_progress" }} label="ช่างเข้าดำเนินงานแล้ว" />
                )}
                {jobRow.status === "in_progress" && (
                  <ActionButton size="lg" url={`/api/admin/jobs/${jobRow.job_id}/status`} body={{ status: "completed" }} label="งานเสร็จและตรวจรับแล้ว" />
                )}
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">ระบบจะสร้างงาน “รอดำเนินการ” ให้อัตโนมัติเมื่อลูกค้าชำระมัดจำ</span>
          )}
        </div>
      </Card>

      {/* ใบสัญญาซื้อขาย (Use Case 15 ข้อ 3) ออกหลังลูกค้ายืนยัน พร้อมกับใบแจ้งหนี้มัดจำ (Activity Diagram 3-4) */}
      <Card title="ใบสัญญาซื้อขาย" size="lg">
        <div className="px-5 pb-5 flex flex-wrap items-center gap-4 text-base">
          {contractRow ? (
            <>
              <span className="font-mono">{contractNo(contractRow)}</span>
              {contractRow.signed_at ? <Badge color="emerald" size="lg">ตรวจสอบสัญญาที่เซ็นแล้ว</Badge>
                : contractRow.signed_file_url ? <Badge color="blue" size="lg">รอตรวจสอบไฟล์ที่ลูกค้าส่งมา</Badge>
                : <Badge color="amber" size="lg">รอลูกค้าเซ็น</Badge>}
              <span className="text-muted-foreground">สร้างเมื่อ {thDate(contractRow.created_at, true)}</span>
              <div className="ml-auto"><ButtonLink href={contractRow.file_url}>ดู / พิมพ์ใบสัญญา</ButtonLink></div>
            </>
          ) : quotation.confirmed_at ? (
            <ActionButton size="lg" url="/api/admin/contracts" body={{ quotation_id: quotation.quotation_id }} label="สร้างใบสัญญาซื้อขาย" />
          ) : (
            <span className="text-muted-foreground">สร้างได้หลังลูกค้ายืนยันใบเสนอราคา</span>
          )}
        </div>
      </Card>

      <Card title="ใบแจ้งหนี้" size="lg">
        <Table size="lg" headers={["เลขที่", "ประเภท", "ยอด", "ครบกำหนด", "การชำระ"]} empty={!invoices.rows.length}>
          {invoices.rows.map((i) => (
            <tr key={i.invoice_id}>
              <td><DocLinks docType="billing-notes" recordId={i.flowaccount_record_id} serial={i.flowaccount_serial ?? `#${i.invoice_id}`} size="lg" /></td>
              <td>{i.type === "deposit" ? "มัดจำ" : "ยอดคงเหลือ"}</td>
              <td className="font-mono font-semibold">{baht(i.amount)}</td>
              <td>{thDate(i.due_date)}</td>
              <td>
                {paidFor(i.invoice_id) ? <Badge color="emerald" size="lg">ชำระแล้ว</Badge> : (
                  // ยังไม่มีระบบ login: ผู้บันทึกรับเงิน = แอดมินที่ทำใบเสนอราคา
                  <CashPaymentForm invoiceId={i.invoice_id} amount={Number(i.amount)} />
                )}
              </td>
            </tr>
          ))}
        </Table>
        {!inv("deposit") && !quotation.confirmed_at && (
          <p className="px-5 pb-4 text-base text-muted-foreground">ใบแจ้งหนี้มัดจำออกได้หลังลูกค้ายืนยันใบเสนอราคา</p>
        )}
        {inv("deposit") && !inv("balance") && !["completed", "closed"].includes(jobRow?.status) && (
          <p className="px-5 pb-4 text-base text-muted-foreground">ใบแจ้งหนี้ยอดคงเหลือออกได้หลังเปลี่ยนสถานะงานเป็น “ดำเนินการเสร็จสิ้น”</p>
        )}
        {((!inv("deposit") && quotation.confirmed_at) || (!inv("balance") && ["completed", "closed"].includes(jobRow?.status))) && (
          <div className="flex flex-wrap gap-3 p-5 border-t border-border">
            {!inv("deposit") && (
              <ActionButton size="lg" url="/api/admin/invoices" body={{ quotation_id: quotation.quotation_id, type: "deposit" }}
                label={`ออกใบแจ้งหนี้มัดจำ (${baht(deposit)})`} />
            )}
            {inv("deposit") && !inv("balance") && ["completed", "closed"].includes(jobRow?.status) && (
              <ActionButton size="lg" variant="outline" url="/api/admin/invoices" body={{ quotation_id: quotation.quotation_id, type: "balance" }}
                label={`ออกใบแจ้งหนี้ยอดคงเหลือ (${baht(total - deposit)})`} />
            )}
          </div>
        )}
      </Card>

      <Card title="การชำระเงินและใบเสร็จ" size="lg">
        <Table size="lg" headers={["ยอด", "วิธีชำระ", "สถานะ", "วันที่ชำระ", "ใบกำกับภาษี", "ใบเสร็จ"]} empty={!payments.rows.length}>
          {payments.rows.map((p) => (
            <tr key={p.payment_id}>
              <td className="font-mono font-semibold">{baht(p.amount)}</td>
              <td>{p.pay_method === "cash" ? "เงินสด" : "QR Code"}</td>
              <td><StatusBadge map={PAYMENT_STATUS} status={p.status} size="lg" /></td>
              <td>{thDate(p.paid_at, true)}</td>
              <td><DocLinks docType="tax-invoices" recordId={p.tax_record_id} serial={p.tax_serial} size="lg" /></td>
              <td>
                {p.receipt_serial ? <DocLinks docType="receipts" recordId={p.receipt_record_id} serial={p.receipt_serial} size="lg" />
                  : p.status === "paid" ? <ActionButton size="lg" url="/api/admin/receipts" body={{ payment_id: p.payment_id }} label="ออกใบเสร็จ / ใบกำกับภาษี" />
                  : "-"}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
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
