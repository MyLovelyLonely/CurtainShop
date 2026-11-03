"use client";
// ปุ่มที่ยิง POST ไป API แล้วรีเฟรชหน้า (ใช้กับ ออกใบแจ้งหนี้ / ออกใบเสร็จ)
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ActionButton({ url, body, label, variant = "primary", size = "sm" }: {
  url: string; body: unknown; label: string; variant?: "primary" | "outline"; size?: "sm" | "lg";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return alert(data.error ?? "ทำรายการไม่สำเร็จ");
    router.refresh();
  }

  const style =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:opacity-90"
      : "border border-primary text-primary hover:bg-primary/10";

  return (
    <button onClick={run} disabled={loading}
      className={`${size === "lg" ? "text-base px-5 py-3 rounded-xl font-semibold" : "text-xs px-3 py-1.5 rounded-lg font-medium"} disabled:opacity-50 ${style}`}>
      {loading ? "กำลังทำรายการ..." : label}
    </button>
  );
}
