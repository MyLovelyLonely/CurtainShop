"use client";
// ปุ่ม "ดูเอกสาร": ขอลิงก์จาก /api/liff/documents/... แล้วเปิดหน้าเอกสาร FlowAccount (ดู/ดาวน์โหลด PDF)
import { useState } from "react";
import { FileText } from "lucide-react";
import { useApi } from "@/components/liff/LiffProvider";

// onError = หน้าที่เรียกใช้แสดงข้อความเอง (ปุ่มจะไม่แสดง error ใต้ปุ่ม)
export function DocButton({ docType, recordId, label = "ดูเอกสาร", onError }: {
  docType: string; recordId: string | number | null; label?: string; onError?: (message: string) => void;
}) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!recordId) return null;

  async function open() {
    setBusy(true); setError(null); onError?.("");
    // เปิดแท็บไว้ก่อนระหว่างรอ ไม่งั้นเบราว์เซอร์มือถือบล็อก popup ที่เปิดหลัง await
    const win = window.open("", "_blank");
    try {
      const res = await api<{ link?: string; pdf?: string }>(`/api/liff/documents/${docType}/${recordId}/link`);
      // ได้ลิงก์ = เปิดหน้าแชร์ของ FlowAccount, ได้ PDF (ขอลิงก์ไม่ได้) = แปลง base64 เป็นไฟล์ในเครื่องแล้วเปิด
      const url = res.link ?? URL.createObjectURL(new Blob([Uint8Array.from(atob(res.pdf ?? ""), (ch) => ch.charCodeAt(0))], { type: "application/pdf" }));
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      win?.close();
      if (onError) onError((e as Error).message);
      else setError((e as Error).message);
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
