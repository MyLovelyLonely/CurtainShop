// เลขที่เอกสาร FlowAccount + ปุ่ม "ดู" (หน้าแชร์ของ FlowAccount) และ "PDF" เปิดในแท็บใหม่
import { Eye, FileDown } from "lucide-react";
import type { DocType } from "@/lib/flowaccount";

export function DocLinks({ docType, recordId, serial, size = "md" }: {
  docType: DocType; recordId: string | number | null; serial: string | null; size?: "md" | "lg";
}) {
  if (!recordId || !serial) return <span className="font-mono">{serial ?? "-"}</span>;

  const base = `/api/admin/flowaccount/${docType}/${recordId}`;
  const btn = `inline-flex items-center gap-1 rounded-lg border border-border hover:border-primary hover:text-primary ${
    size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs"}`;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono">{serial}</span>
      <a href={`${base}/link`} target="_blank" rel="noopener noreferrer" className={btn} title="ดูเอกสารใน FlowAccount">
        <Eye size={size === "lg" ? 15 : 13} /> ดู
      </a>
      <a href={`${base}/pdf?serial=${encodeURIComponent(serial)}`} target="_blank" rel="noopener noreferrer" className={btn} title="เปิดไฟล์ PDF">
        <FileDown size={size === "lg" ? 15 : 13} /> PDF
      </a>
    </span>
  );
}
