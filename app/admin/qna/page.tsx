// คำถาม-คำตอบ (Use Case 20)
import { pool } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/admin/ui";

export default async function Qna() {
  const { rows } = await pool.query(`
    select q.*, a.full_name as admin_name from qna q join admin a using (admin_id) order by q.qna_id`);

  return (
    <>
      <PageHeader title="คำถาม-คำตอบ (Q&A)" sub={`${rows.length} คำถาม · ลูกค้าค้นหาผ่าน LINE LIFF`} />
      <div className="space-y-2">
        {rows.map((q) => (
          <Card key={q.qna_id}>
            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{q.question}</p>
                {q.is_visible ? <Badge color="emerald">แสดง</Badge> : <Badge>ซ่อน</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{q.answer}</p>
              <p className="text-[11px] text-muted-foreground">โดย {q.admin_name}</p>
            </div>
          </Card>
        ))}
        {!rows.length && <p className="text-center text-sm text-muted-foreground py-8">ยังไม่มีคำถาม</p>}
      </div>
    </>
  );
}
