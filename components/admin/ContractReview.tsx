"use client";
// แอดมินตรวจใบสัญญาที่ลูกค้าเซ็นส่งกลับ: ยืนยัน หรือ ตีกลับพร้อมบอกสิ่งที่ต้องแก้ (ลูกค้าได้รับทาง LINE)
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ContractReview({ contractId }: { contractId: number }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [loading, setLoading] = useState(false);

  async function review(action: "confirm" | "reject") {
    if (action === "confirm" && !confirm("ยืนยันใบสัญญาที่ลูกค้าเซ็นแล้ว?")) return;
    setLoading(true);
    const res = await fetch(`/api/admin/contracts/${contractId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return alert(data.error ?? "ทำรายการไม่สำเร็จ");
    router.refresh();
  }

  if (rejecting) {
    return (
      <div className="space-y-3">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus
          placeholder="เช่น ยังไม่ได้เซ็นหน้า 2 / รูปไม่ชัด กรุณาถ่ายใหม่"
          className="w-full border-2 border-border rounded-xl px-3 py-2 text-base bg-white focus:outline-none focus:border-primary" />
        <div className="flex gap-3">
          <button onClick={() => review("reject")} disabled={loading || !note.trim()}
            className="h-11 px-4 rounded-xl text-base font-semibold bg-red-600 text-white hover:opacity-90 disabled:opacity-50">
            {loading ? "กำลังส่ง..." : "ส่งให้ลูกค้าแก้ไข"}
          </button>
          <button onClick={() => setRejecting(false)} className="h-11 px-4 rounded-xl text-base font-semibold border-2 border-border">
            ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button onClick={() => review("confirm")} disabled={loading}
        className="h-11 px-5 rounded-xl text-base font-semibold bg-emerald-600 text-white hover:opacity-90 disabled:opacity-50">
        {loading ? "กำลังบันทึก..." : "ยืนยันเอกสาร"}
      </button>
      <button onClick={() => setRejecting(true)}
        className="h-11 px-5 rounded-xl text-base font-semibold border-2 border-red-600 text-red-700 hover:bg-red-50">
        ไม่ถูกต้อง ให้ลูกค้าแก้ไข
      </button>
    </div>
  );
}
