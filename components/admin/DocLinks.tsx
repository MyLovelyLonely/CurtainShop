"use client";
// เลขที่เอกสาร FlowAccount + ปุ่ม "ดู" (หน้าแชร์ของ FlowAccount) และ "ส่งออก" (Use Case 16)
//   ส่งออก: กดแล้วกางตัวเลือกรูปแบบไฟล์ PDF / รูปภาพ ต่อท้ายปุ่ม (Use Case 16 ข้อ 2 "เลือกรูปแบบไฟล์")
//   กางในบรรทัดเดียวกันแทนเมนูลอย เพราะตาราง (overflow-x-auto) จะตัดเมนูลอยของแถวล่าง ๆ
import { useState } from "react";
import { ChevronDown, Eye, FileDown, FileText, ImageIcon } from "lucide-react";
import type { DocType } from "@/lib/flowaccount";

export function DocLinks({ docType, recordId, serial, size = "md" }: {
  docType: DocType; recordId: string | number | null; serial: string | null; size?: "md" | "lg";
}) {
  const [exporting, setExporting] = useState(false);
  if (!recordId || !serial) return <span className="font-mono">{serial ?? "-"}</span>;

  const base = `/api/admin/flowaccount/${docType}/${recordId}`;
  const icon = size === "lg" ? 15 : 13;
  const btn = `inline-flex items-center gap-1 rounded-lg border border-border hover:border-primary hover:text-primary ${
    size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs"}`;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono">{serial}</span>
      <a href={`${base}/link`} target="_blank" rel="noopener noreferrer" className={btn} title="ดูเอกสารใน FlowAccount">
        <Eye size={icon} /> ดู
      </a>
      <button type="button" onClick={() => setExporting(!exporting)} aria-expanded={exporting}
        className={`${btn} ${exporting ? "border-primary text-primary" : ""}`} title="ส่งออกเอกสาร (เลือก PDF หรือรูปภาพ)">
        <FileDown size={icon} /> ส่งออก
        <ChevronDown size={icon} className={`transition-transform ${exporting ? "rotate-180" : ""}`} />
      </button>
      {exporting && (
        <>
          <a href={`${base}/pdf?serial=${encodeURIComponent(serial)}`} target="_blank" rel="noopener noreferrer"
            className={btn} title="ส่งออกเป็นไฟล์ PDF">
            <FileText size={icon} /> PDF
          </a>
          {/* ส่งออกเป็นรูปภาพ ยังไม่ได้ทำ: แสดงตัวเลือกไว้ก่อน กดแล้วยังไม่มีผล */}
          <button type="button" className={btn} title="ส่งออกเป็นรูปภาพ">
            <ImageIcon size={icon} /> รูปภาพ
          </button>
        </>
      )}
    </span>
  );
}
