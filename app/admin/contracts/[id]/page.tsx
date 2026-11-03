// ตรวจใบสัญญาซื้อขาย: ไฟล์ที่ร้านส่ง (file_url) เทียบกับไฟล์ที่ลูกค้าเซ็นกลับ (signed_file_url)
//   รอตรวจสอบ = ยืนยัน (signed_at) หรือตีกลับให้ลูกค้าส่งใหม่
import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { contractNo } from "@/lib/shop";
import { CONTRACT_BADGE, contractStatus } from "@/lib/contract";
import { ContractReview } from "@/components/admin/ContractReview";
import { Badge, Card, PageHeader, thDate } from "@/components/admin/ui";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await pool.query(
    `select ct.*, q.flowaccount_serial as qt_serial, q.details->'customer'->>'name' as customer,
            q.details->'contract_reject' as reject
     from contract ct join quotation q using (quotation_id) where ct.contract_id = $1`,
    [id],
  );
  const ct = r.rows[0];
  if (!ct) notFound();

  const status = contractStatus(ct);
  const [label, color] = CONTRACT_BADGE[status];

  return (
    <>
      <PageHeader title={`ใบสัญญา ${contractNo(ct)}`} sub={`${ct.customer} · ส่งเมื่อ ${thDate(ct.created_at, true)}`}>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/admin/quotations/${ct.quotation_id}`} className="text-primary underline text-base">
            ใบเสนอราคา {ct.qt_serial ?? `#${ct.quotation_id}`}
          </Link>
          <Badge color={color} size="lg">{label}{status === "confirmed" ? ` ${thDate(ct.signed_at, true)}` : ""}</Badge>
        </div>
      </PageHeader>

      {status === "waiting_review" && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl px-5 py-4 space-y-3">
          <p className="text-base text-blue-900 font-semibold">ลูกค้าส่งใบสัญญาที่เซ็นแล้ว ตรวจสอบไฟล์ด้านขวาก่อนยืนยัน</p>
          <ContractReview contractId={ct.contract_id} />
        </div>
      )}
      {status === "waiting_sign" && ct.reject && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl px-5 py-4 text-base text-amber-900">
          ส่งให้ลูกค้าแก้ไขเมื่อ {thDate(ct.reject.at, true)}: “{ct.reject.note}” · รอลูกค้าส่งใหม่
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FileCard title="ไฟล์ที่ร้านส่ง" url={ct.file_url} />
        {ct.signed_file_url
          ? <FileCard title="ไฟล์ที่ลูกค้าเซ็นกลับ" url={ct.signed_file_url} />
          : <Card title="ไฟล์ที่ลูกค้าเซ็นกลับ" size="lg"><p className="px-5 pb-5 text-base text-muted-foreground">ลูกค้ายังไม่ได้ส่งไฟล์</p></Card>}
      </div>
    </>
  );
}

function FileCard({ title, url }: { title: string; url: string }) {
  const isPdf = url.toLowerCase().endsWith(".pdf");
  return (
    <Card title={title} size="lg">
      <div className="px-5 pb-5 space-y-3">
        {isPdf
          ? <iframe src={url} title={title} className="w-full h-[70vh] border border-border rounded-lg" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={url} alt={title} className="w-full border border-border rounded-lg" />}
        <a href={url} target="_blank" rel="noreferrer" className="text-primary underline text-base">เปิดในแท็บใหม่ / ดาวน์โหลด</a>
      </div>
    </Card>
  );
}
