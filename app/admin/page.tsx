// ภาพรวมธุรกิจ (Use Case 14: ดูรายงานและแดชบอร์ดธุรกิจ, ขอบเขต 1.3.11)
//   ?range=day | month | year  แอดมินเลือกช่วงเวลา (UC 14 ข้อ 1)
//   รายได้     = เงินที่รับแล้ว (payment.status = paid) ตามวันที่ชำระ
//   ยอดขาย     = ใบเสนอราคาที่ลูกค้ายืนยันในช่วงนั้น (ก่อน VAT) แยกตามหมวดหมู่สินค้า ผ้าม่าน / อุปกรณ์ (1.3.11.1)
//   งาน / ช่าง = งานที่เสร็จในช่วงนั้น + ระยะเวลาติดตั้งเฉลี่ย (started_at -> completed_at) ต่อช่าง (1.3.11.2)
//   ช่วงปัจจุบันเทียบกับช่วงก่อนหน้าเพื่อดูแนวโน้มการเติบโต (UC 14 ข้อ 3)
import Link from "next/link";
import { Banknote, Calculator, ClipboardCheck, Receipt, ShoppingBag, Timer } from "lucide-react";
import { pool } from "@/lib/db";
import { BarChart } from "@/components/admin/BarChart";
import { Badge, baht, Card, EmptyState, JOB_STATUS, PageHeader, StatusBadge, Table, thDate } from "@/components/admin/ui";

const TZ = "Asia/Bangkok";
const RANGES = {
  day: { label: "รายวัน", points: 14, current: "วันนี้", prev: "เมื่อวาน", trend: "14 วันล่าสุด" },
  month: { label: "รายเดือน", points: 12, current: "เดือนนี้", prev: "เดือนก่อน", trend: "12 เดือนล่าสุด" },
  year: { label: "รายปี", points: 5, current: "ปีนี้", prev: "ปีก่อน", trend: "5 ปีล่าสุด" },
} as const;
type Range = keyof typeof RANGES;

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
// key = 'YYYY-MM-DD' ตามเวลาไทย (มาจาก SQL) แปลงเป็นป้ายภาษาไทย พ.ศ.
function bucketLabel(key: string, range: Range) {
  const [y, m, d] = key.split("-").map(Number);
  const be = y + 543;
  if (range === "day") return { label: `${d}/${m}`, full: `${d} ${MONTHS[m - 1]} ${be}` };
  if (range === "month") return { label: MONTHS[m - 1], full: `${MONTHS[m - 1]} ${be}` };
  return { label: String(be), full: `ปี ${be}` };
}

// ระยะเวลาติดตั้งเป็นข้อความ (ชั่วโมง)
function duration(hours: number | null) {
  if (hours === null) return "-";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} นาที`;
  if (hours < 24) return `${hours.toFixed(1)} ชม.`;
  return `${(hours / 24).toFixed(1)} วัน`;
}

// เปลี่ยนแปลงจากช่วงก่อนหน้า มีลูกศร + ข้อความ ไม่ใช้สีอย่างเดียว
function Growth({ cur, prev, label }: { cur: number; prev: number; label: string }) {
  if (prev === 0) return <span className="text-muted-foreground">{cur > 0 ? `ไม่มีข้อมูล${label}ให้เทียบ` : "-"}</span>;
  const pct = ((cur - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={up ? "text-emerald-700" : "text-red-700"}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% จาก{label}
    </span>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: r } = await searchParams;
  const range: Range = r && r in RANGES ? (r as Range) : "month";
  const R = RANGES[range];

  // w.s = ต้นช่วงปัจจุบัน, w.p = ต้นช่วงก่อนหน้า, w.e = สิ้นช่วงปัจจุบัน (เวลาไทย)
  const W = `with w as (
      select (date_trunc($1::text, now() at time zone '${TZ}')) at time zone '${TZ}' as s,
             (date_trunc($1::text, now() at time zone '${TZ}') - ('1 ' || $1)::interval) at time zone '${TZ}' as p,
             (date_trunc($1::text, now() at time zone '${TZ}') + ('1 ' || $1)::interval) at time zone '${TZ}' as e)`;
  // ยอดก่อน VAT ต่อรายการ x จำนวนห้อง (สูตรเดียวกับ lib/pricing.ts)
  const LINE = `(case when p.price_unit in ('ตร.ม.', 'ตารางเมตร') then qi.width * qi.height * qi.quantity else qi.quantity end)
                * qi.unit_price * coalesce((q.details->>'room_count')::int, 1)`;

  const [trend, sales, jobs, techs, statusCount, todo, recent] = await Promise.all([
    // แนวโน้มรายได้ย้อนหลัง
    pool.query(
      `select to_char(b.t, 'YYYY-MM-DD') as key, coalesce(sum(p.amount), 0)::float as total
       from generate_series(date_trunc($1::text, now() at time zone '${TZ}') - ($2::int - 1) * ('1 ' || $1)::interval,
                            date_trunc($1::text, now() at time zone '${TZ}'), ('1 ' || $1)::interval) as b(t)
       left join payment p on p.status = 'paid' and date_trunc($1::text, p.paid_at at time zone '${TZ}') = b.t
       group by b.t order by b.t`,
      [range, R.points],
    ),
    // ยอดขายแยกหมวดหมู่ ช่วงปัจจุบัน / ก่อนหน้า
    pool.query(
      `${W}
       select c.category_id, c.name,
              coalesce(sum(${LINE}) filter (where q.confirmed_at >= w.s and q.confirmed_at < w.e), 0)::float as cur,
              coalesce(sum(${LINE}) filter (where q.confirmed_at >= w.p and q.confirmed_at < w.s), 0)::float as prev
       from w, category c
       left join catalog ct using (category_id)
       left join product p using (catalog_id)
       left join quotation_item qi using (product_id)
       left join quotation q using (quotation_id)
       group by c.category_id, c.name order by c.category_id`,
      [range],
    ),
    // งานในช่วงปัจจุบัน
    pool.query(
      `${W}
       select count(*) filter (where j.created_at >= w.s and j.created_at < w.e)::int as created,
              count(*) filter (where j.completed_at >= w.s and j.completed_at < w.e)::int as done,
              count(*) filter (where j.completed_at >= w.p and j.completed_at < w.s)::int as done_prev,
              (avg(extract(epoch from j.completed_at - j.started_at)) filter (where j.completed_at >= w.s and j.completed_at < w.e)) / 3600 as avg_hours
       from w, job j`,
      [range],
    ),
    // สถิติช่าง: งานที่เสร็จในช่วงนี้ + เวลาติดตั้งเฉลี่ย + นัดที่ยังไม่ถึง
    pool.query(
      `${W}
       select t.technician_id, t.name,
              count(distinct j.job_id) filter (where j.completed_at >= w.s and j.completed_at < w.e)::int as done,
              (avg(extract(epoch from j.completed_at - j.started_at)) filter (where j.completed_at >= w.s and j.completed_at < w.e)) / 3600 as avg_hours,
              count(distinct j.job_id) filter (where j.status in ('completed', 'closed'))::int as done_all,
              count(distinct s.schedule_id) filter (where s.work_time >= now())::int as upcoming
       from w, technician t
       left join job_schedule s using (technician_id)
       left join job j using (job_id)
       group by t.technician_id, t.name order by done desc, t.name`,
      [range],
    ),
    pool.query(`select status, count(*)::int as n from job group by status`),
    pool.query(
      `select (select count(*)::int from price_estimate where not is_contacted) as estimates,
              count(*)::int as unpaid, coalesce(sum(i.amount), 0) as unpaid_total
       from invoice i
       where not exists (select 1 from payment p where p.invoice_id = i.invoice_id and p.status = 'paid')`,
    ),
    pool.query(
      `select q.quotation_id, q.flowaccount_serial, q.total_amount, q.created_at, q.confirmed_at,
              q.details->'customer'->>'name' as customer
       from quotation q order by q.created_at desc limit 5`,
    ),
  ]);

  const points = trend.rows.map((t) => ({ key: t.key, value: Number(t.total), ...bucketLabel(t.key, range) }));
  const revCur = points.at(-1)?.value ?? 0;
  const revPrev = points.at(-2)?.value ?? 0;
  const salesCur = sales.rows.reduce((s, c) => s + c.cur, 0);
  const salesPrev = sales.rows.reduce((s, c) => s + c.prev, 0);
  const j = jobs.rows[0];
  const statusN = Object.fromEntries(statusCount.rows.map((s) => [s.status, s.n]));
  const t = todo.rows[0];
  const noData = revCur === 0 && salesCur === 0 && j.created === 0 && j.done === 0;
  // สีตามหมวดหมู่ (ลำดับ category_id คงที่) ผ่าน validator: ทอง / น้ำเงิน
  const SERIES = ["#b5831f", "#2a78d6"];

  return (
    <>
      <PageHeader title="ภาพรวมธุรกิจ" sub={`ข้อมูล ณ ${thDate(new Date(), true)}`}>
        <nav className="flex gap-1 bg-muted rounded-xl p-1" aria-label="ช่วงเวลา">
          {(Object.keys(RANGES) as Range[]).map((k) => (
            <Link key={k} href={`/admin?range=${k}`} aria-current={k === range ? "page" : undefined}
              className={`px-4 py-2 rounded-lg text-base font-medium ${k === range ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {RANGES[k].label}
            </Link>
          ))}
        </nav>
      </PageHeader>

      {/* UC 14 Alternate Flow */}
      {noData && <EmptyState>ไม่พบข้อมูลในช่วงเวลานี้ ({R.current})</EmptyState>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Banknote} label={`รายได้${R.current}`} value={baht(revCur)} sub={<Growth cur={revCur} prev={revPrev} label={R.prev} />} />
        <Kpi icon={ShoppingBag} label={`ยอดขาย${R.current} (ก่อน VAT)`} value={baht(salesCur)} sub={<Growth cur={salesCur} prev={salesPrev} label={R.prev} />} />
        <Kpi icon={ClipboardCheck} label={`งานที่เสร็จ${R.current}`} value={`${j.done} งาน`}
          sub={<span className="text-muted-foreground">งานใหม่ {j.created} งาน · {R.prev} เสร็จ {j.done_prev}</span>} />
        <Kpi icon={Timer} label="ระยะเวลาติดตั้งเฉลี่ย" value={duration(j.avg_hours === null ? null : Number(j.avg_hours))}
          sub={<span className="text-muted-foreground">จากเริ่มงานถึงเสร็จ ({R.current})</span>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title={`รายได้ ${R.trend}`} className="lg:col-span-2">
          <p className="px-4 -mt-1 pb-3 text-xs text-muted-foreground">เงินที่ได้รับแล้วทั้งเงินสดและ QR ตามวันที่ชำระ</p>
          <BarChart data={points} unitLabel="รายได้" />
        </Card>

        <Card title={`ยอดขายแยกประเภท (${R.current})`}>
          <div className="px-4 pb-4 space-y-4">
            {salesCur === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">ไม่พบข้อมูลในช่วงเวลานี้</p>
            ) : (
              <>
                {/* แถบสัดส่วน มีช่องว่าง 2px ระหว่างส่วน */}
                <div className="flex gap-[2px] h-4" role="img"
                  aria-label={sales.rows.map((c) => `${c.name} ${baht(c.cur)}`).join(", ")}>
                  {sales.rows.filter((c) => c.cur > 0).map((c) => (
                    <div key={c.category_id} className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
                      style={{ width: `${(c.cur / salesCur) * 100}%`, background: SERIES[sales.rows.indexOf(c)] ?? "#a1a1aa" }} />
                  ))}
                </div>
                <ul className="space-y-2.5">
                  {sales.rows.map((c, i) => (
                    <li key={c.category_id} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: SERIES[i] ?? "#a1a1aa" }} />
                      <span className="flex-1">{c.name}</span>
                      <span className="font-mono font-semibold">{baht(c.cur)}</span>
                      <span className="w-12 text-right text-muted-foreground">{((c.cur / salesCur) * 100).toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-xs text-muted-foreground border-t border-border pt-3">
              จากใบเสนอราคาที่ลูกค้ายืนยัน{R.current} · {R.prev} {baht(salesPrev)}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title={`ผลการทำงานของช่าง (${R.current})`} className="lg:col-span-2">
          <Table headers={["ช่าง", `งานเสร็จ${R.current}`, "เวลาติดตั้งเฉลี่ย", "งานเสร็จทั้งหมด", "นัดที่จะถึง"]} empty={!techs.rows.length}>
            {techs.rows.map((tc) => (
              <tr key={tc.technician_id}>
                <td>{tc.name}</td>
                <td className="font-mono">{tc.done}</td>
                <td>{duration(tc.avg_hours === null ? null : Number(tc.avg_hours))}</td>
                <td className="font-mono">{tc.done_all}</td>
                <td className="font-mono">{tc.upcoming}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="สถานะงานทั้งหมดตอนนี้">
          <div className="px-4 pb-4 space-y-2">
            {Object.entries(JOB_STATUS).map(([key]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <StatusBadge map={JOB_STATUS} status={key} />
                <span className="font-mono font-bold">{statusN[key] ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
          <Link href="/admin/estimates"><Kpi icon={Calculator} label="ใบประเมินรอติดต่อ" value={`${t.estimates} ใบ`}
            sub={<span className="text-muted-foreground">ลูกค้ารอนัดดูหน้างาน</span>} /></Link>
          <Link href="/admin/invoices"><Kpi icon={Receipt} label="ใบแจ้งหนี้รอชำระ" value={`${t.unpaid} ใบ`}
            sub={<span className="text-muted-foreground">มูลค่า {baht(t.unpaid_total)}</span>} /></Link>
        </div>
        <Card title="ใบเสนอราคาล่าสุด" className="lg:col-span-2">
          <Table headers={["เลขที่", "ลูกค้า", "ยอดรวม", "วันที่", "สถานะ"]} empty={!recent.rows.length}>
            {recent.rows.map((q) => (
              <tr key={q.quotation_id} className="hover:bg-muted/30">
                <td className="font-mono text-xs">
                  <Link href={`/admin/quotations/${q.quotation_id}`} className="text-primary hover:underline">
                    {q.flowaccount_serial ?? `#${q.quotation_id}`}
                  </Link>
                </td>
                <td>{q.customer}</td>
                <td className="font-mono">{baht(q.total_amount)}</td>
                <td className="text-muted-foreground">{thDate(q.created_at)}</td>
                <td>{q.confirmed_at ? <Badge color="emerald">ลูกค้ายืนยันแล้ว</Badge> : <Badge color="amber">รอลูกค้ายืนยัน</Badge>}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string; sub: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 h-full">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Icon size={16} /> {label}</p>
      <p className="text-2xl font-bold font-mono mt-1">{value}</p>
      <p className="text-xs mt-1">{sub}</p>
    </div>
  );
}
