import { Suspense } from "react";
import { Sidebar } from "@/components/admin/Sidebar";

// Next 16 (cacheComponents): ไม่ใช้ force-dynamic แล้ว ข้อมูลที่ไม่ได้ "use cache" ดึงสดทุกครั้งอยู่แล้ว
// หน้าโหลดตอนเปลี่ยนหน้าอยู่ใน loading.tsx, Sidebar ครอบ Suspense เพราะใช้ usePathname
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Suspense>
        <Sidebar />
      </Suspense>
      <main className="flex-1 overflow-y-auto p-6 space-y-5">{children}</main>
    </div>
  );
}
