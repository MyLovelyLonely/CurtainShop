import { Suspense } from "react";
import { Sidebar } from "@/components/admin/Sidebar";

// Next 16 (cacheComponents): ไม่ใช้ force-dynamic แล้ว ข้อมูลที่ไม่ได้ "use cache" ดึงสดทุกครั้งอยู่แล้ว
// หน้าโหลดตอนเปลี่ยนหน้าอยู่ใน loading.tsx, Sidebar ครอบ Suspense เพราะใช้ usePathname
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // ตอนพิมพ์ (เช่น ใบสัญญา) ซ่อนเมนูข้าง เหลือแค่เนื้อหา
    <div className="flex h-screen print:block print:h-auto">
      <div className="print:hidden contents">
        <Suspense>
          <Sidebar />
        </Suspense>
      </div>
      <main className="flex-1 overflow-y-auto p-6 space-y-5 print:p-0 print:overflow-visible">{children}</main>
    </div>
  );
}
