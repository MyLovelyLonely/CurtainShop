// ใบประเมินราคาจากลูกค้า (ผ่าน LINE LIFF) -> แอดมินติดต่อลูกค้า -> วัดหน้างาน -> ทำใบเสนอราคา (Use Case 12)
// ไล่ตาม Activity Diagram: ยังไม่ได้ติดต่อ -> ติดต่อแล้ว (รอวัดหน้างาน) -> ทำใบเสนอราคาแล้ว
// สถานะติดต่อสำคัญเฉพาะช่วงก่อนมีใบเสนอราคา พอมีใบเสนอราคาแล้วจึงไม่แสดง
import { CalendarDays, Check, ChevronRight, Clock, Home, Phone, Ruler } from "lucide-react";
import { pool } from "@/lib/db";
import { Badge, baht, ButtonLink, EmptyState, PageHeader, Tabs, thDate } from "@/components/admin/ui";
import { EstimateContactControl } from "@/components/admin/EstimateContactControl";

const TABS = ["todo", "contacted", "done", "all"] as const;

type Stage = "new" | "contacted" | "quoted";

const STAGE_STYLE: Record<Stage, { stripe: string; label: string; color: "amber" | "blue" | "emerald" }> = {
  new: { stripe: "border-l-amber-500", label: "ยังไม่ได้ติดต่อ", color: "amber" },
  contacted: { stripe: "border-l-blue-500", label: "ติดต่อแล้ว · รอวัดหน้างาน", color: "blue" },
  quoted: { stripe: "border-l-emerald-500", label: "ทำใบเสนอราคาแล้ว", color: "emerald" },
};

const stageOf = (e: { quotation_id: number | null; is_contacted: boolean }): Stage =>
  e.quotation_id ? "quoted" : e.is_contacted ? "contacted" : "new";

const waitedText = (createdAt: string | Date) => {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  return days <= 0 ? "ส่งมาวันนี้" : `รอมาแล้ว ${days} วัน`;
};

export default async function Estimates({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t === tabParam) ?? "todo";

  const { rows } = await pool.query(`
    select e.*, coalesce(c.full_name, c.display_name) as customer, c.display_name, c.phone,
           (select count(*)::int from price_estimate_item i where i.estimate_id = e.estimate_id) as item_count,
           q.quotation_id, q.flowaccount_serial
    from price_estimate e
    join customer c using (customer_id)
    left join quotation q using (estimate_id)
    order by e.created_at desc`);

  // ยังไม่ได้ติดต่อ: เรียงเก่าสุดก่อน ใครรอนานสุดต้องติดต่อก่อน
  const todo = rows.filter((e) => stageOf(e) === "new").reverse();
  const contacted = rows.filter((e) => stageOf(e) === "contacted");
  const done = rows.filter((e) => stageOf(e) === "quoted");
  const list = { todo, contacted, done, all: rows }[tab];

  return (
    <>
      <PageHeader title="ใบประเมินราคา" sub={`ทั้งหมด ${rows.length} ใบ · ยังไม่ได้ติดต่อ ${todo.length} ราย`} />

      <Tabs
        basePath="/admin/estimates"
        active={tab}
        tabs={[
          { key: "todo", label: "ยังไม่ได้ติดต่อ", count: todo.length },
          { key: "contacted", label: "ติดต่อแล้ว รอทำใบเสนอราคา", count: contacted.length },
          { key: "done", label: "ทำใบเสนอราคาแล้ว", count: done.length },
          { key: "all", label: "ทั้งหมด", count: rows.length },
        ]}
      />

      {!list.length && (
        <EmptyState>{tab === "todo" ? "ติดต่อลูกค้าครบทุกรายแล้ว 🎉" : "ไม่มีใบประเมินราคาในหมวดนี้"}</EmptyState>
      )}

      <div className="space-y-3">
        {list.map((e) => {
          const stage = stageOf(e);
          const style = STAGE_STYLE[stage];
          return (
            <div key={e.estimate_id}
              className={`bg-card border border-border border-l-4 ${style.stripe} rounded-xl p-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(190px,1.2fr)_minmax(150px,0.8fr)_minmax(170px,1fr)_auto] lg:items-center`}>
              {/* ลูกค้า */}
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">ใบประเมิน #{e.estimate_id}</p>
                <p className="text-xl font-semibold">{e.customer}</p>
                <p className="mt-1 text-sm text-muted-foreground">LINE: <span className="font-medium text-foreground">{e.display_name || e.customer}</span></p>
                {e.phone ? (
                  <a href={`tel:${e.phone}`} className="mt-1 inline-flex items-center gap-1.5 text-base font-medium text-primary hover:underline">
                    <Phone size={16} /> {e.phone}
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">ไม่มีเบอร์โทร · ติดต่อทาง LINE</p>
                )}
              </div>

              {/* รายละเอียด */}
              <div className="space-y-1.5 text-base">
                <p className="flex items-center gap-2"><Ruler size={17} className="text-muted-foreground" /> {e.item_count} รายการ</p>
                <p className="flex items-center gap-2"><Home size={17} className="text-muted-foreground" /> {e.room_count} ห้อง</p>
                <p className="flex items-center gap-2"><CalendarDays size={17} className="text-muted-foreground" /> {thDate(e.created_at)}</p>
                {e.method === "ai" ? <Badge color="purple">AI วัดจากรูป</Badge> : <Badge>ลูกค้ากรอกขนาดเอง</Badge>}
              </div>

              {/* ขั้นตอนตอนนี้ */}
              <div className="flex flex-col items-start gap-2">
                {stage === "quoted" ? (
                  <>
                    <Badge color={style.color} size="lg"><Check size={14} className="mr-1 inline" />{style.label}</Badge>
                    {e.flowaccount_serial && (
                      <p className="text-sm text-muted-foreground">เลขที่ <span className="font-mono">{e.flowaccount_serial}</span></p>
                    )}
                  </>
                ) : (
                  <EstimateContactControl key={`${e.estimate_id}-${e.is_contacted}`} estimateId={e.estimate_id} isContacted={e.is_contacted} />
                )}
                {stage === "new" && (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700">
                    <Clock size={15} /> {waitedText(e.created_at)}
                  </p>
                )}
                {stage === "contacted" && <p className="text-sm text-muted-foreground">นัดวัดหน้างาน แล้วกดทำใบเสนอราคา</p>}
              </div>

              {/* ราคา + คำสั่งหลักของขั้นตอนนั้น */}
              <div className="flex flex-wrap items-center justify-between gap-4 lg:justify-end">
                <div className="text-left lg:text-right">
                  <p className="text-sm text-muted-foreground">ราคาประเมินเบื้องต้น</p>
                  <p className="text-2xl font-bold font-mono">{baht(e.total_price)}</p>
                </div>
                {stage === "new" && (
                  // ปุ่มสีเทากดไม่ได้ จนกว่าจะเปลี่ยนสถานะเป็น "ติดต่อแล้ว" ตามลำดับใน Activity Diagram
                  <span aria-disabled="true"
                    className="inline-flex cursor-not-allowed select-none items-center justify-center gap-1.5 px-5 py-3 rounded-xl text-base font-semibold whitespace-nowrap bg-muted text-muted-foreground opacity-60">
                    ทำใบเสนอราคา <ChevronRight size={18} />
                  </span>
                )}
                {stage === "contacted" && (
                  <ButtonLink href={`/admin/quotations/new?estimate_id=${e.estimate_id}`}>
                    ทำใบเสนอราคา <ChevronRight size={18} />
                  </ButtonLink>
                )}
                {stage === "quoted" && (
                  <ButtonLink href={`/admin/quotations/${e.quotation_id}`} variant="outline">
                    ดูใบเสนอราคา <ChevronRight size={18} />
                  </ButtonLink>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
