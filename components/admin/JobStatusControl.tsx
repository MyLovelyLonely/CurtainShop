"use client";
// เลือกสถานะงาน (Use Case 21 ข้อ 2 "แอดมินเลือกสถานะใหม่") แสดงแทนป้ายสถานะในหน้างานและสถานะงาน
//   เป็น dropdown สีตามสถานะ แสดงครบทั้ง 4 สถานะ (Data Dictionary 3-35) แต่เลือกได้เฉพาะที่กฎอนุญาต
//   ตัวเลือกที่เลือกไม่ได้เป็นสีเทาพร้อมบอกเหตุผล แอดมินจึงรู้ว่าทำไมเลือกไม่ได้
//   กฎ (ตรวจซ้ำที่ API app/api/admin/jobs/[id]/status/route.ts)
//     - แอดมินเปลี่ยนได้แค่ กำลังดำเนินการ / ดำเนินการเสร็จสิ้น (ขอบเขต 1.3.5.2)
//       รอดำเนินการ / ปิดงาน ระบบเปลี่ยนเองตามการชำระเงิน (1.3.5.1)
//     - ไปข้างหน้าทีละขั้น ข้ามขั้นไม่ได้
//     - ย้อนกลับได้ (ดำเนินการเสร็จสิ้น -> กำลังดำเนินการ) แต่ต้องยืนยันก่อน (Use Case 21 Alternate Flow)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BADGE_COLORS, JOB_STATUS } from "@/components/admin/ui";

const ORDER = ["pending", "in_progress", "completed", "closed"];
const ADMIN_STATUSES = ["in_progress", "completed"];

// เหตุผลที่เลือกสถานะ to ไม่ได้ เมื่อสถานะปัจจุบันคือ from (null = เลือกได้)
//   ข้อความสั้น เพราะ dropdown กว้างตามตัวเลือกที่ยาวที่สุด (คำอธิบายเต็มอยู่ใน title ของ dropdown)
function blockedReason(from: string, to: string): string | null {
  if (to === from) return null;
  if (!ADMIN_STATUSES.includes(to)) return "ระบบเปลี่ยนเอง";
  if (ORDER.indexOf(to) > ORDER.indexOf(from) + 1) return "ข้ามขั้นไม่ได้";
  return null;
}

export function JobStatusControl({ jobId, status }: { jobId: number; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(to: string) {
    if (to === status) return;
    const back = ORDER.indexOf(to) < ORDER.indexOf(status);
    const label = JOB_STATUS[to][0];
    // เปลี่ยนแล้วระบบแจ้งลูกค้าทาง LINE จึงถามก่อนทุกครั้ง ย้อนกลับเตือนเพิ่มว่าเป็นการย้อนสถานะ
    const ok = confirm(back
      ? `ย้อนสถานะงาน #${jobId} กลับเป็น "${label}"?\nใช้เมื่อเปลี่ยนสถานะผิด ระบบจะแจ้งลูกค้าทาง LINE`
      : `เปลี่ยนสถานะงาน #${jobId} เป็น "${label}"?\nระบบจะแจ้งลูกค้าทาง LINE`);
    if (!ok) return;

    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to, confirm: back }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      router.refresh(); // โหลดข้อมูลหน้าใหม่ สถานะ / วันที่เริ่ม-เสร็จ / ตัวเลขสรุปด้านบนอัปเดตตาม
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const color = BADGE_COLORS[JOB_STATUS[status]?.[1] ?? "gray"];
  const closed = status === "closed"; // ปิดงานแล้ว = จบ เปลี่ยนไม่ได้อีก

  return (
    <div className="space-y-1">
      <select value={status} disabled={busy || closed} onChange={(e) => change(e.target.value)}
        title={closed ? "งานปิดแล้ว เปลี่ยนสถานะไม่ได้"
          : "เลือกสถานะใหม่ · รอดำเนินการ = ระบบเปลี่ยนเมื่อชำระมัดจำ · ปิดงาน = ระบบปิดเมื่อชำระยอดคงเหลือ"}
        className={`rounded-full border px-3 py-1.5 text-sm font-medium cursor-pointer disabled:cursor-default disabled:opacity-70 ${color}`}>
        {ORDER.map((s) => {
          const reason = blockedReason(status, s);
          return (
            <option key={s} value={s} disabled={reason !== null}>
              {JOB_STATUS[s][0]}{reason ? ` (${reason})` : ""}
            </option>
          );
        })}
      </select>
      {busy && <p className="text-xs text-muted-foreground">กำลังบันทึก...</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
