"use client";
// ปุ่ม "ดูเอกสาร": ขอลิงก์จาก /api/liff/documents/... แล้วเปิดหน้าเอกสาร FlowAccount (ดู/ดาวน์โหลด PDF)
import { useState } from "react";
import { FileText } from "lucide-react";
import { useApi } from "@/components/liff/LiffProvider";

export function DocButton({ docType, recordId, label = "ดูเอกสาร" }: { docType: string; recordId: string | number | null; label?: string }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!recordId) return null;

  async function open() {
    setBusy(true); setError(null);
    // เปิดแท็บไว้ก่อนระหว่างรอ ไม่งั้นเบราว์เซอร์มือถือบล็อก popup ที่เปิดหลัง await
    const win = window.open("", "_blank");
    try {
      const { link } = await api<{ link: string }>(`/api/liff/documents/${docType}/${recordId}/link`);
      if (win) win.location.href = link;
      else window.location.href = link;
    } catch (e) {
      win?.close();
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div>
      <button onClick={open} disabled={busy}
        className="w-full flex items-center justify-center gap-2 border-2 border-primary text-primary rounded-xl py-2.5 text-base font-semibold disabled:opacity-50">
        <FileText size={18} /> {busy ? "กำลังเปิด..." : label}
      </button>
      {error && <p className="text-sm text-red-700 mt-1.5 text-center">{error}</p>}
    </div>
  );
}
