"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/admin/ui";

type Qna = { qna_id: number; question: string; answer: string; is_visible: boolean; admin_name: string };

export default function QnaManager({ rows }: { rows: Qna[] }) {
  const [form, setForm] = useState<Qna | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Qna | null>(null);

  return (
    <>
      <PageHeader title="คำถาม-คำตอบ (Q&A)" sub={`${rows.length} คำถาม · ลูกค้าค้นหาผ่าน LINE LIFF`}>
        <button type="button" onClick={() => setForm(null)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
          <Plus size={18} /> เพิ่มคำถาม
        </button>
      </PageHeader>

      <div className="space-y-2">
        {rows.map((q) => (
          <Card key={q.qna_id}>
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">{q.question}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{q.answer}</p>
                <p className="text-[11px] text-muted-foreground">โดย {q.admin_name}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {q.is_visible ? <Badge color="emerald">แสดง</Badge> : <Badge>ซ่อน</Badge>}
                <button type="button" onClick={() => setForm(q)} aria-label="แก้ไขคำถาม"
                  className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted">
                  <Pencil size={16} />
                </button>
                <button type="button" onClick={() => setDeleting(q)} aria-label="ลบคำถาม"
                  className="rounded-lg border border-border p-2 text-red-700 hover:bg-red-50">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </Card>
        ))}
        {!rows.length && <p className="text-center text-sm text-muted-foreground py-8">ยังไม่มีคำถาม</p>}
      </div>

      {form !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={() => setForm(undefined)}>
          <section role="dialog" aria-modal="true" aria-labelledby="qna-form-title"
            className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="qna-form-title" className="text-lg font-bold">{form ? "แก้ไขคำถาม" : "เพิ่มคำถาม"}</h2>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">คำถาม</span>
              <input defaultValue={form?.question ?? ""} className="w-full rounded-xl border-2 border-border bg-card px-3 py-2 outline-none focus:border-primary" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">คำตอบ</span>
              <textarea defaultValue={form?.answer ?? ""} rows={5} className="w-full rounded-xl border-2 border-border bg-card px-3 py-2 outline-none focus:border-primary" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked={form?.is_visible ?? true} className="h-4 w-4 accent-[var(--primary)]" />
              แสดงให้ลูกค้าเห็นใน LINE LIFF
            </label>
            <p className="text-sm text-amber-800">การบันทึกยังไม่เชื่อมต่อระบบ</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(undefined)}
                className="rounded-xl border-2 border-border px-4 py-2 text-sm font-semibold">ปิด</button>
              <button type="button" disabled
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground opacity-50">
                บันทึก
              </button>
            </div>
          </section>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={() => setDeleting(null)}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="qna-delete-title"
            className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="qna-delete-title" className="text-lg font-bold">ลบคำถาม</h2>
            <p className="text-sm">{deleting.question}</p>
            <p className="text-sm text-amber-800">การลบยังไม่เชื่อมต่อระบบ</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(null)}
                className="rounded-xl border-2 border-border px-4 py-2 text-sm font-semibold">ปิด</button>
              <button type="button" disabled
                className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white opacity-50">ลบคำถาม</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
