// ใบประเมินราคาจากลูกค้า (ผ่าน LINE LIFF) -> แอดมินกดทำใบเสนอราคา (Use Case 12)
// แสดงเป็นการ์ดตัวใหญ่ อ่านง่าย แยกแท็บ "รอทำใบเสนอราคา" ไว้เป็นหน้าแรก
import { CalendarDays, ChevronRight, Home, Phone, Ruler } from "lucide-react";
import { pool } from "@/lib/db";
import { Badge, baht, ButtonLink, EmptyState, PageHeader, Tabs, thDate } from "@/components/admin/ui";

const TABS = ["todo", "done", "all"] as const;

export default async function Estimates({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t === tabParam) ?? "todo";

  const { rows } = await pool.query(`
    select e.*, coalesce(c.full_name, c.display_name) as customer, c.phone,
           (select count(*)::int from price_estimate_item i where i.estimate_id = e.estimate_id) as item_count,
           q.quotation_id, q.flowaccount_serial
    from price_estimate e
    join customer c using (customer_id)
    left join quotation q using (estimate_id)
    order by e.created_at desc`);

  const todo = rows.filter((e) => !e.quotation_id);
  const done = rows.filter((e) => e.quotation_id);
  const list = tab === "todo" ? todo : tab === "done" ? done : rows;

  return (
    <>
      <PageHeader title="ใบประเมินราคา" sub="ลูกค้าส่งมาจาก LINE · กด “ทำใบเสนอราคา” หลังวัดหน้างานจริงแล้ว" />

      <Tabs
        basePath="/admin/estimates"
        active={tab}
        tabs={[
          { key: "todo", label: "รอทำใบเสนอราคา", count: todo.length },
          { key: "done", label: "ทำใบเสนอราคาแล้ว", count: done.length },
          { key: "all", label: "ทั้งหมด", count: rows.length },
        ]}
      />

      {!list.length && <EmptyState>ไม่มีใบประเมินราคาในหมวดนี้</EmptyState>}

      <div className="space-y-3">
        {list.map((e) => (
          <div key={e.estimate_id} className="bg-card border border-border rounded-xl p-5 flex flex-wrap items-center gap-x-8 gap-y-4">
            {/* ลูกค้า */}
            <div className="min-w-56 flex-1">
              <p className="text-sm text-muted-foreground">ใบประเมิน #{e.estimate_id}</p>
              <p className="text-xl font-semibold">{e.customer}</p>
              {e.phone ? (
                <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1.5 text-base text-primary font-medium hover:underline mt-1">
                  <Phone size={16} /> {e.phone}
                </a>
              ) : (
                <p className="text-base text-muted-foreground mt-1">ไม่มีเบอร์โทร</p>
              )}
            </div>

            {/* รายละเอียด */}
            <div className="space-y-1.5 text-base min-w-52">
              <p className="flex items-center gap-2"><Ruler size={17} className="text-muted-foreground" /> {e.item_count} รายการ</p>
              <p className="flex items-center gap-2"><Home size={17} className="text-muted-foreground" /> {e.room_count} ห้อง</p>
              <p className="flex items-center gap-2"><CalendarDays size={17} className="text-muted-foreground" /> {thDate(e.created_at)}</p>
            </div>

            {/* สถานะ */}
            <div className="flex flex-col gap-2 items-start min-w-40">
              {e.method === "ai" ? <Badge color="purple" size="lg">AI วัดจากรูป</Badge> : <Badge size="lg">ลูกค้ากรอกขนาดเอง</Badge>}
              {e.quotation_id ? <Badge color="emerald" size="lg">ทำใบเสนอราคาแล้ว</Badge>
                : e.is_contacted ? <Badge color="blue" size="lg">ติดต่อลูกค้าแล้ว</Badge>
                : <Badge color="amber" size="lg">ยังไม่ได้ติดต่อ</Badge>}
            </div>

            {/* ราคา + ปุ่ม */}
            <div className="ml-auto flex items-center gap-5">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">ราคาประเมินเบื้องต้น</p>
                <p className="text-2xl font-bold font-mono">{baht(e.total_price)}</p>
              </div>
              {e.quotation_id ? (
                <ButtonLink href={`/admin/quotations/${e.quotation_id}`} variant="outline">
                  ดูใบเสนอราคา <ChevronRight size={18} />
                </ButtonLink>
              ) : (
                <ButtonLink href={`/admin/quotations/new?estimate_id=${e.estimate_id}`}>
                  ทำใบเสนอราคา <ChevronRight size={18} />
                </ButtonLink>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
