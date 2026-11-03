"use client";
// กราฟแท่งชุดเดียว (แนวโน้มรายได้) ชี้ / แตะที่แท่งเพื่อดูค่า + มีตารางสำหรับอ่านค่าทั้งหมด
//   ป้ายตัวเลขบนแท่งแสดงเฉพาะแท่งล่าสุดกับแท่งสูงสุด ที่เหลือดูจาก tooltip หรือตาราง
import { useState } from "react";
import { baht } from "@/components/admin/ui";

type Point = { key: string; label: string; full: string; value: number };

// จัดรูปแบบเงินบาทในนี้เอง (ส่งฟังก์ชันจาก Server Component มาเป็น prop ไม่ได้)
const format = (n: number) => baht(n).replace(/\.00$/, "");

export function BarChart({ data, unitLabel }: { data: Point[]; unitLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const maxIdx = data.findIndex((d) => d.value === max);
  const last = data.length - 1;

  return (
    <div className="px-4 pb-4">
      <div className="relative h-56 flex items-end gap-[2px] border-b border-border" onPointerLeave={() => setHover(null)}>
        {/* เส้นกริดจาง ๆ */}
        {[0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-border/60 pointer-events-none" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2.5 left-0 bg-card pr-1 text-[10px] text-muted-foreground font-mono">{format(max * f)}</span>
          </div>
        ))}
        {data.map((d, i) => {
          const showLabel = d.value > 0 && (i === last || i === maxIdx);
          return (
            <button key={d.key} type="button"
              aria-label={`${d.full}: ${format(d.value)}`}
              onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              className="relative flex-1 h-full flex flex-col justify-end items-center outline-none group">
              {showLabel && hover !== i && (
                <span className="text-[10px] font-mono text-foreground mb-0.5 whitespace-nowrap">{format(d.value)}</span>
              )}
              <span className={`w-full max-w-10 rounded-t-[4px] bg-primary transition-opacity ${hover !== null && hover !== i ? "opacity-50" : ""}`}
                style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }} />
              {hover === i && (
                <span className="absolute bottom-full mb-1 z-10 bg-foreground text-background rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg">
                  <b className="font-mono">{format(d.value)}</b><br />{d.full}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex gap-[2px] mt-1">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 text-center text-[10px] text-muted-foreground truncate">
            {/* แสดงป้ายแกนเว้นระยะ ไม่ให้ชนกันเมื่อมีหลายแท่ง */}
            {data.length <= 12 || i % 2 === last % 2 ? d.label : ""}
          </span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground">ดูเป็นตาราง</summary>
        <table className="mt-2 w-full">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">ช่วงเวลา</th><th className="py-1 font-medium text-right">{unitLabel}</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-t border-border"><td className="py-1">{d.full}</td><td className="py-1 text-right font-mono">{format(d.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
