// ใบสัญญาซื้อขาย (Use Case 15 ข้อ 3, Use Case 16) สร้างจากข้อมูลใบเสนอราคาในระบบ
//   หน้าจอ = ดูสัญญา + ปุ่มพิมพ์, ตอนพิมพ์ = เหลือแค่ตัวสัญญาขนาด A4 (บันทึกเป็น PDF ได้จากหน้าต่างพิมพ์)
//   ข้อความเงื่อนไขเป็นแม่แบบ ปรับตามที่ร้านใช้จริง
import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { lineArea, lineTotal } from "@/lib/pricing";
import { contractNo, SHOP } from "@/lib/shop";
import { PrintButton } from "@/components/admin/PrintButton";
import { Badge, baht, thDate } from "@/components/admin/ui";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await pool.query(
    `select c.*, q.quotation_id, q.flowaccount_serial as qt_serial, q.total_amount, q.deposit_amount,
            q.confirmed_at, q.details
     from contract c join quotation q using (quotation_id) where c.contract_id = $1`,
    [id],
  );
  const c = r.rows[0];
  if (!c) notFound();

  const items = await pool.query(
    `select qi.*, p.name, p.price_unit from quotation_item qi join product p using (product_id)
     where qi.quotation_id = $1 order by qi.quotation_item_id`,
    [c.quotation_id],
  );

  const customer = c.details.customer;
  const rooms = Number(c.details.room_count) || 1;
  const roomSubTotal = items.rows.reduce((s, i) => s + lineTotal(i, i.price_unit), 0);
  const subTotal = Math.round(roomSubTotal * rooms * 100) / 100;
  const total = Number(c.total_amount);
  const deposit = Number(c.deposit_amount);

  return (
    <>
      {/* แถบเครื่องมือ ไม่แสดงตอนพิมพ์ */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/admin/quotations/${c.quotation_id}`} className="text-primary underline text-base">
            ← ใบเสนอราคา {c.qt_serial ?? `#${c.quotation_id}`}
          </Link>
          {c.signed_at ? <Badge color="emerald" size="lg">ตรวจสอบสัญญาที่เซ็นแล้ว</Badge>
            : c.signed_file_url ? <Badge color="blue" size="lg">รอตรวจสอบไฟล์ที่ลูกค้าส่งมา</Badge>
            : <Badge color="amber" size="lg">รอลูกค้าเซ็น</Badge>}
        </div>
        <PrintButton />
      </div>

      <article className="bg-white text-black mx-auto w-full max-w-[210mm] p-10 print:p-0 border border-border print:border-0 rounded-xl print:rounded-none text-[15px] leading-relaxed space-y-5">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold">สัญญาซื้อขายและติดตั้งผ้าม่าน</h1>
          <p>เลขที่ {contractNo(c)} · ทำที่ {SHOP.name} · วันที่ {thDate(c.created_at)}</p>
        </header>

        <section className="grid grid-cols-2 gap-6">
          <div>
            <p className="font-semibold">ผู้ขาย</p>
            <p>{SHOP.name}</p>
            {SHOP.address && <p>{SHOP.address}</p>}
            {SHOP.phone && <p>โทร {SHOP.phone}</p>}
            {SHOP.taxId && <p>เลขประจำตัวผู้เสียภาษี {SHOP.taxId}</p>}
          </div>
          <div>
            <p className="font-semibold">ผู้ซื้อ</p>
            <p>{customer.name}</p>
            {customer.address && <p>{customer.address}</p>}
            {customer.phone && <p>โทร {customer.phone}</p>}
            {customer.tax_id && <p>เลขประจำตัวผู้เสียภาษี {customer.tax_id}</p>}
          </div>
        </section>

        <p>
          คู่สัญญาทั้งสองฝ่ายตกลงซื้อขายและติดตั้งสินค้าตามใบเสนอราคาเลขที่ <b>{c.qt_serial ?? `#${c.quotation_id}`}</b>
          {" "}ซึ่งผู้ซื้อยืนยันแล้วเมื่อ {thDate(c.confirmed_at, true)}
          {c.details.project_name ? ` สถานที่ติดตั้ง ${c.details.project_name}` : ""} โดยมีรายละเอียดดังนี้
        </p>

        <section>
          <p className="font-semibold mb-2">ข้อ 1 รายการสินค้า{rooms > 1 ? ` (ต่อ 1 ห้อง จำนวน ${rooms} ห้อง)` : ""}</p>
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="bg-black/5 [&>th]:border [&>th]:border-black/40 [&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left">
                <th className="w-8">#</th><th>รายการ</th><th>ขนาด (กว้าง × สูง)</th><th>จำนวน</th>
                <th className="!text-right">ราคาต่อหน่วย</th><th className="!text-right">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {items.rows.map((i, idx) => {
                const area = lineArea(i, i.price_unit);
                return (
                  <tr key={i.quotation_item_id} className="[&>td]:border [&>td]:border-black/40 [&>td]:px-2 [&>td]:py-1.5">
                    <td>{idx + 1}</td>
                    <td>{i.name}</td>
                    <td>{i.width && i.height ? `${Number(i.width)} × ${Number(i.height)} ม.` : "-"}</td>
                    <td>{area === null ? `${i.quantity} ${i.price_unit}` : `${i.quantity} หน้าต่าง (${area.toFixed(2)} ตร.ม.)`}</td>
                    <td className="text-right">{baht(i.unit_price)} / {i.price_unit}</td>
                    <td className="text-right">{baht(lineTotal(i, i.price_unit))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="ml-auto mt-2 w-80 space-y-0.5">
            <Row label={rooms > 1 ? `รวมต่อ 1 ห้อง × ${rooms} ห้อง` : "รวมเป็นเงิน"} value={baht(subTotal)} />
            <Row label="ภาษีมูลค่าเพิ่ม 7%" value={baht(total - subTotal)} />
            <Row label="รวมทั้งสิ้น" value={baht(total)} bold />
          </div>
        </section>

        <section className="space-y-1">
          <p className="font-semibold">ข้อ 2 การชำระเงิน</p>
          <p>2.1 ผู้ซื้อชำระเงินมัดจำ <b>{baht(deposit)}</b> ก่อนผู้ขายเริ่มดำเนินงาน</p>
          <p>2.2 ผู้ซื้อชำระยอดคงเหลือ <b>{baht(total - deposit)}</b> หลังติดตั้งเสร็จและผู้ซื้อตรวจรับงานแล้ว</p>
          <p>2.3 ชำระผ่าน QR Code พร้อมเพย์ในระบบ หรือชำระเงินสดกับเจ้าหน้าที่ของผู้ขาย ผู้ขายออกใบเสร็จรับเงินทุกครั้งที่ได้รับชำระ</p>
        </section>

        <section className="space-y-1">
          <p className="font-semibold">ข้อ 3 การติดตั้ง</p>
          <p>3.1 ผู้ขายนัดวันติดตั้งกับผู้ซื้อหลังได้รับเงินมัดจำ และแจ้งความคืบหน้าทาง LINE</p>
          <p>3.2 ผู้ซื้ออำนวยความสะดวกให้ช่างเข้าพื้นที่ติดตั้งตามวันเวลาที่นัดหมาย</p>
          <p>3.3 สินค้าสั่งผลิตตามขนาดที่วัดจากหน้างานจริง หลังลงนามในสัญญาไม่สามารถเปลี่ยนแปลงขนาดหรือรายการสินค้าได้</p>
        </section>

        <p>สัญญานี้ทำขึ้นสองฉบับมีข้อความตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความโดยตลอดแล้ว จึงลงลายมือชื่อไว้เป็นหลักฐาน</p>

        <section className="grid grid-cols-2 gap-10 pt-10 text-center">
          {[["ผู้ซื้อ", customer.name], ["ผู้ขาย", SHOP.name]].map(([role, name]) => (
            <div key={role} className="space-y-1">
              <p>ลงชื่อ ......................................................</p>
              <p>({name})</p>
              <p>{role}</p>
              <p>วันที่ ........../........../..........</p>
            </div>
          ))}
        </section>
      </article>
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-bold border-t border-black/40 pt-1" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
