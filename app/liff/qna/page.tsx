"use client";
// คำถามที่พบบ่อย (Use Case 6) เปิดจาก Rich Menu
//   พิมพ์ค้นหาได้ ไม่พบ = แนะนำให้ติดต่อแอดมินทางแชท LINE
import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useLiffData } from "@/components/liff/LiffProvider";
import { Empty, PageTitle, Panel } from "@/components/liff/ui";

type Qna = { qna_id: number; question: string; answer: string };

export default function LiffQna() {
  const { data, error } = useLiffData<{ qna: Qna[] }>("/api/liff/qna");
  const [search, setSearch] = useState("");

  const keyword = search.trim().toLowerCase();
  const list = (data?.qna ?? []).filter((q) => `${q.question} ${q.answer}`.toLowerCase().includes(keyword));

  return (
    <>
      <PageTitle title="คำถามที่พบบ่อย" />

      <label className="flex items-center gap-2 bg-card border-2 border-border rounded-xl px-3 focus-within:border-primary">
        <Search size={20} className="text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาคำถาม"
          className="flex-1 py-3 text-lg bg-transparent outline-none" />
      </label>

      {error && <Panel className="text-red-700 text-base">{error}</Panel>}
      {!data && !error && <Panel className="text-center text-muted-foreground">กำลังโหลด...</Panel>}

      {data && (
        <div className="space-y-3">
          {list.map((q) => (
            <details key={q.qna_id} className="group bg-card border border-border rounded-2xl">
              <summary className="flex items-center justify-between gap-3 p-4 text-lg font-semibold cursor-pointer list-none">
                {q.question}
                <ChevronDown size={22} className="shrink-0 text-muted-foreground group-open:rotate-180 transition-transform" />
              </summary>
              <p className="px-4 pb-4 text-base text-muted-foreground whitespace-pre-line">{q.answer}</p>
            </details>
          ))}

          {!list.length && (
            <Empty>
              {keyword ? "ไม่พบคำถามที่ค้นหา" : "ยังไม่มีคำถาม"}<br />
              <span className="text-sm">สอบถามเพิ่มเติมได้ที่แชท LINE ของร้าน หรือกดเมนู “ติดต่อเจ้าหน้าที่”</span>
            </Empty>
          )}
        </div>
      )}
    </>
  );
}
