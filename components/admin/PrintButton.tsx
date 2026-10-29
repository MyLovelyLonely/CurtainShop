"use client";
// ปุ่มพิมพ์ / บันทึกเป็น PDF (ใช้ตัวพิมพ์ของเบราว์เซอร์ ตัวอักษรไทยแสดงถูกต้อง)
import { Printer } from "lucide-react";

export function PrintButton({ label = "พิมพ์ / บันทึกเป็น PDF" }: { label?: string }) {
  return (
    <button onClick={() => window.print()}
      className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-xl text-base font-semibold hover:opacity-90">
      <Printer size={18} /> {label}
    </button>
  );
}
