"use client";
// ฟอร์มบันทึกรับเงินสด (Use Case 9 A2): แอดมินนับเงินแล้วกรอกยอดที่ได้รับ ยอดไม่ตรง = ระบบไม่บันทึก
// ผู้บันทึก = แอดมินที่เข้าสู่ระบบ (API ดึงเอง ไม่ส่งจากหน้าเว็บ)
import { useRouter } from "next/navigation";
import { useState } from "react";
import { baht } from "@/components/admin/ui";

export function CashPaymentForm({ invoiceId, amount }: { invoiceId: number; amount: number }) {
  const router = useRouter();
  const [received, setReceived] = useState(String(amount));
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!confirm(`ยืนยันรับเงินสด ${baht(Number(received))} ?`)) return;
    setLoading(true);
    const res = await fetch("/api/admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_id: invoiceId, amount: Number(received) }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return alert(data.error ?? "บันทึกไม่สำเร็จ");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="number" inputMode="decimal" step="0.01" min="0" value={received} onChange={(e) => setReceived(e.target.value)}
        className="w-40 h-11 border-2 border-border rounded-xl px-3 text-base font-mono bg-white focus:outline-none focus:border-primary" />
      <button onClick={save} disabled={loading || received === ""}
        className="h-11 px-4 rounded-xl text-base font-semibold bg-emerald-600 text-white hover:opacity-90 disabled:opacity-50">
        {loading ? "กำลังบันทึก..." : "บันทึกรับเงินสด"}
      </button>
    </div>
  );
}
