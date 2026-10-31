"use client";
// ส่งใบสัญญาซื้อขาย (PDF ที่ร้านเซ็นแล้ว) ให้ลูกค้า ระบบแจ้งลูกค้าทาง LINE
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SendContractForm({ quotationId }: { quotationId: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!file) return;
    setLoading(true);
    const form = new FormData();
    form.set("quotation_id", String(quotationId));
    form.set("file", file);
    const res = await fetch("/api/admin/contracts", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return alert(data.error ?? "ส่งใบสัญญาไม่สำเร็จ");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-muted file:font-medium" />
      <button onClick={send} disabled={!file || loading}
        className="h-11 px-4 rounded-xl text-base font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
        {loading ? "กำลังส่ง..." : "ส่งให้ลูกค้าทาง LINE"}
      </button>
    </div>
  );
}
