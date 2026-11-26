"use client"; // CartLink ใช้ useCart (hook) จึงต้องเป็น client component
import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCart } from "@/components/liff/CartProvider";

type Props = {
  backHref: string;    // ปุ่มย้อนกลับไปไหน
  backLabel: string;   // ข้อความข้างลูกศร
};

export function PageHeader({ backHref, backLabel }: Props) {
  return (
    
    <div className="sticky top-0 z-10 flex items-center justify-between bg-background/95 backdrop-blur px-4 py-2">
      <Link href={backHref} className="-ml-1 flex items-center gap-2 rounded-lg p-1 text-stone-900">
        <ArrowLeft size={22} className="text-stone-600" />
        <span className="text-base font-bold">{backLabel}</span>
      </Link>
      <CartLink />
    </div>
    
  );
}

// แยกไอคอนตะกร้าออกมาอีกชั้น เผื่ออยากใช้เดี่ยวๆ ที่อื่น
export function CartLink() {
  const { count, lastAddAt } = useCart(); // count = จำนวนรายการ, lastAddAt = เวลาที่ใส่ของสำเร็จล่าสุด
  const badge = useRef<HTMLSpanElement>(null); // ชี้ไปที่จุดแดง เพื่อสั่งให้เด้ง

  // ใส่ของสำเร็จ (ทั้งรายการเดิมและรายการใหม่) → จุดแดงเด้งดึ๋งๆ
  // เช็กเวลาด้วย: Next.js ซ่อนหน้าเก่าไว้ไม่ได้ลบ (React Activity) พอกลับมาหน้าเดิม effect นี้จะรันอีกรอบ
  // ถ้ากดเพิ่มไปนานกว่าครึ่งวินาทีแล้ว = แค่กลับมาหน้านี้ ไม่ได้เพิ่งกด → ไม่เด้ง
  useEffect(() => {
    if (Date.now() - lastAddAt > 500) return;
    badge.current?.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.6)", offset: 0.25 },  // ใหญ่ขึ้น
        { transform: "scale(0.8)", offset: 0.45 },  // หดลง
        { transform: "scale(1.25)", offset: 0.65 }, // ใหญ่นิด
        { transform: "scale(0.93)", offset: 0.8 },  // หดนิด
        { transform: "scale(1)" },                  // ปกติ
      ],
      { duration: 600, easing: "ease-out" },
    );
  }, [lastAddAt]);

  return (
    <Link href="/liff/estimate" aria-label={`ใบสรุปราคา ${count} รายการ`} title="ใบสรุปราคา" className="relative rounded-lg p-1.5 text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">
            {/* จุดแดงนับรายการ: ไม่มีของไม่แสดง */}
            {count > 0 && (
              <span ref={badge} aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">
                {count}
              </span>
            )}
            {/* รถเข็นมีตาข่าย (วาดเอง lucide ไม่มีแบบนี้) */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1c1410" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 3h2.5l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h9.6a1.5 1.5 0 0 0 1.5-1.2L21 6H5.1" />
              <path d="M9.6 6l.5 9.4M13.6 6v9.4M17.6 6l-.5 9.4M5.9 10.5h14.2" strokeWidth="1" />
              <circle cx="8.5" cy="20" r="1.3" />
              <circle cx="17.5" cy="20" r="1.3" />
            </svg>
    </Link>
  );
}