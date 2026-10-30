// ทำใบเสนอราคาจากใบประเมินราคา (Use Case 12): แอดมินแก้ขนาดหน้างานจริง แล้วบันทึก
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { Card, PageHeader } from "@/components/admin/ui";
import { currentAdmin } from "@/lib/admin-auth";
import { QuotationForm } from "./QuotationForm";

export default async function NewQuotation({ searchParams }: { searchParams: Promise<{ estimate_id?: string }> }) {
  const { estimate_id } = await searchParams;
  if (!estimate_id) notFound();

  const est = await pool.query(
    `select e.*, c.full_name, c.display_name, c.phone, c.address, c.details as customer_details
     from price_estimate e join customer c using (customer_id) where e.estimate_id = $1`,
    [estimate_id],
  );
  const estimate = est.rows[0];
  if (!estimate) notFound();

  const [items, admin] = await Promise.all([
    // quantity = จำนวนหน้าต่างต่อห้อง ราคาต่อหน่วยดึงจากสินค้า (แอดมินแก้ไม่ได้)
    pool.query(
      `select i.item_id, i.width::float, i.height::float, i.quantity,
              p.name, p.price_unit, p.base_price::float as unit_price
       from price_estimate_item i join product p using (product_id)
       where i.estimate_id = $1 order by i.item_id`,
      [estimate_id],
    ),
    currentAdmin(), // ผู้จัดทำ = แอดมินที่เข้าสู่ระบบ
  ]);

  return (
    <>
      <PageHeader title="ทำใบเสนอราคา" sub={`จากใบประเมินราคา #${estimate.estimate_id} · กรอกขนาดที่วัดได้จริงจากหน้างาน`} />
      <Card title="ข้อมูลลูกค้า" size="lg">
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-base">
          <Info label="ชื่อ-นามสกุล" value={estimate.full_name ?? <span className="text-red-600">ยังไม่มี (ต้องกรอกก่อนออกเอกสาร)</span>} />
          <Info label="ชื่อ LINE" value={estimate.display_name} />
          <Info label="โทรศัพท์" value={estimate.phone ?? "-"} />
          <Info label="เลขผู้เสียภาษี" value={estimate.customer_details?.tax_id ?? "-"} />
          <div className="col-span-2 lg:col-span-4"><Info label="ที่อยู่" value={estimate.address ?? "-"} /></div>
        </div>
      </Card>
      <QuotationForm
        mode={{ kind: "create", estimateId: estimate.estimate_id }}
        initialItems={items.rows}
        roomCount={Number(estimate.room_count) || 1}
        adminName={admin?.full_name}
        wantTaxInvoice={Boolean(estimate.customer_details?.tax_id)}
      />
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-medium">{value}</p>
    </div>
  );
}
