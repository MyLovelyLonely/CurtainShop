"use client";

// แสดงรายการทีละส่วน: วางไว้ท้ายรายการ เลื่อนมาใกล้แล้วเรียก onMore (มีปุ่มสำรองเผื่อ IntersectionObserver ใช้ไม่ได้)

import { useEffect, useRef, useState } from "react";

export const PAGE_SIZE = 24;

/** จำนวนที่แสดง — เริ่มใหม่ที่ PAGE_SIZE ทุกครั้งที่ listKey เปลี่ยน (เปลี่ยนคำค้น/ตัวกรอง) */
export function usePaged(listKey: string) {
  const [state, setState] = useState({ key: listKey, count: PAGE_SIZE });
  const count = state.key === listKey ? state.count : PAGE_SIZE;
  return [count, () => setState({ key: listKey, count: count + PAGE_SIZE })] as const;
}

export function LoadMore({ remaining, onMore }: { remaining: number; onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || remaining <= 0) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onMore(), {
      rootMargin: "600px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [remaining, onMore]);

  if (remaining <= 0) return null;
  return (
    <div ref={ref} className="py-6 text-center">
      <button onClick={onMore} className="text-sm text-brand">
        แสดงเพิ่ม ({remaining} รายการ)
      </button>
    </div>
  );
}
