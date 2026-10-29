// แก้ไขใบเสนอราคา (Use Case 15 Alternate Flow, Activity Diagram 3-4)
//   ลูกค้าแจ้งว่าข้อมูลไม่ถูกต้อง -> แอดมินแก้ขนาด / จำนวนหน้าต่าง -> ส่งให้ลูกค้าตรวจสอบอีกครั้ง
//   แก้ได้เฉพาะก่อนลูกค้ายืนยันและก่อนออกใบแจ้งหนี้
import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { Card, PageHeader } from "@/components/admin/ui";
import { QuotationForm } from "../../new/QuotationForm";

export default async function EditQuotation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await pool.query(
    `select q.*, exists (select 1 from invoice i where i.quotation_id = q.quotation_id) as has_invoice
     from quotation q where quotation_id = $1`, [id]);
  const quotation = q.rows[0];
  if (!quotation) notFound();

  const title = `แก้ไขใบเสนอราคา ${quotation.flowaccount_serial ?? `#${quotation.quotation_id}`}`;
  const locked = quotation.confirmed_at ? "ลูกค้ายืนยันใบเสนอราคานี้แล้ว" : quotation.has_invoice ? "ออกใบแจ้งหนี้จากใบเสนอราคานี้แล้ว" : null;
  if (locked) {
    return (
      <>
        <PageHeader title={title} />
        <Card size="lg">
          <div className="p-5 space-y-3 text-base">
            <p className="text-lg font-semibold">แก้ไขไม่ได้: {locked}</p>
            <Link href={`/admin/quotations/${id}`} className="text-primary underline">กลับไปหน้าใบเสนอราคา</Link>
          </div>
        </Card>
      </>
    );
  }

  // ราคาต่อหน่วยดึงจากสินค้าปัจจุบัน เหมือนตอนสร้าง (แอดมินแก้ไม่ได้)
  const items = await pool.query(
    `select qi.quotation_item_id as item_id, qi.width::float, qi.height::float, qi.quantity,
            p.name, p.price_unit, p.base_price::float as unit_price
     from quotation_item qi join product p using (product_id)
     where qi.quotation_id = $1 order by qi.quotation_item_id`,
    [id],
  );

  return (
    <>
      <PageHeader title={title} sub={`ลูกค้า ${quotation.details.customer.name} · แก้ไขแล้วลูกค้าต้องตรวจสอบและยืนยันอีกครั้ง`} />
      <QuotationForm
        mode={{ kind: "edit", quotationId: quotation.quotation_id, projectName: quotation.details.project_name ?? "" }}
        initialItems={items.rows}
        roomCount={Number(quotation.details.room_count) || 1}
      />
    </>
  );
}
