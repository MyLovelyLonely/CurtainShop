"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock } from "lucide-react";

// สวิตช์สองสถานะ มีหัวข้อ "สถานะการติดต่อ" กำกับ ให้เห็นชัดว่าเป็นการเปลี่ยนสถานะ ไม่ใช่ปุ่มโทรหาลูกค้า
export function EstimateContactControl({ estimateId, isContacted }: { estimateId: number; isContacted: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(isContacted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function updateContactStatus(nextValue: boolean) {
    if (nextValue === value) return;
    const previousValue = value;
    setValue(nextValue);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/estimates/${estimateId}/contacted`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_contacted: nextValue }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "เปลี่ยนสถานะการติดต่อไม่สำเร็จ");
      router.refresh();
    } catch (e) {
      setValue(previousValue);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const option = (active: boolean, activeStyle: string) =>
    `inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-wait ${
      active ? activeStyle : "bg-card text-muted-foreground hover:bg-muted"
    }`;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">สถานะการติดต่อ {busy && "· กำลังบันทึก..."}</p>
      <div role="radiogroup" aria-label="สถานะการติดต่อ" className="inline-flex overflow-hidden rounded-lg border border-border">
        <button type="button" role="radio" aria-checked={!value} disabled={busy}
          onClick={() => updateContactStatus(false)}
          className={option(!value, "bg-amber-500 text-white")}>
          <Clock size={15} /> ยังไม่ได้ติดต่อ
        </button>
        <button type="button" role="radio" aria-checked={value} disabled={busy}
          onClick={() => updateContactStatus(true)}
          className={`border-l border-border ${option(value, "bg-blue-600 text-white")}`}>
          <Check size={15} /> ติดต่อแล้ว
        </button>
      </div>
      {error && <p role="alert" className="max-w-56 text-xs text-red-700">{error}</p>}
    </div>
  );
}
