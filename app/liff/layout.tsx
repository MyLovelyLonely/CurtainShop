// หน้าฝั่งลูกค้า (LINE LIFF) จอมือถือ + เมนูล่าง
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Scissors } from "lucide-react";
import { LiffProvider } from "@/components/liff/LiffProvider";
import { BottomNav } from "@/components/liff/BottomNav";

export const metadata: Metadata = { title: "ร้านผ้าม่าน" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#b5831f" };

export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-2">
          <Scissors size={18} />
          <p className="font-serif font-bold text-lg">ร้านผ้าม่าน</p>
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 pt-4 pb-24 space-y-4">
        {/* Next 16: หน้าที่อ่าน params / usePathname ต้องอยู่ใน Suspense */}
        <Suspense fallback={<p className="text-center text-muted-foreground">กำลังโหลด...</p>}>
          <LiffProvider>{children}</LiffProvider>
        </Suspense>
      </main>
      <Suspense>
        <BottomNav />
      </Suspense>
    </div>
  );
}
