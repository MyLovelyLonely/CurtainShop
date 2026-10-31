// หน้าแจ้งว่าเปิด / ส่งออกเอกสาร FlowAccount ไม่ได้ (Use Case 16 Alternate Flow)
//   API ปุ่ม "ดู" / "PDF" redirect มาที่นี่ (lib/error-page.ts) พร้อม ?title= &detail= &retry=
import { RotateCw } from "lucide-react";
import { Card, PageHeader } from "@/components/admin/ui";

export default async function DocumentError({ searchParams }: {
  searchParams: Promise<{ title?: string; detail?: string; retry?: string }>;
}) {
  const { title, detail, retry } = await searchParams;
  // ปุ่มลองใหม่ลิงก์กลับไปได้เฉพาะ API เอกสาร FlowAccount ของเราเท่านั้น กันใครแนบลิงก์เว็บอื่นมาใน URL
  const retryHref = retry?.startsWith("/api/admin/flowaccount/") ? retry : null;

  return (
    <>
      <PageHeader title={title ?? "ไม่สามารถเปิดเอกสารได้"} />
      <Card className="border-2 border-amber-300 bg-amber-50 p-5 space-y-4 max-w-xl">
        <p className="text-base text-amber-900">{detail ?? "กรุณาลองใหม่อีกครั้ง"}</p>
        {/* <a> ธรรมดา ไม่ใช้ Link เพราะปลายทางเป็น API (PDF / redirect ไป FlowAccount) ไม่ใช่หน้าในแอป */}
        {retryHref && (
          <a href={retryHref}
            className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl text-base font-semibold bg-primary text-primary-foreground hover:opacity-90">
            <RotateCw size={18} /> ลองใหม่อีกครั้ง
          </a>
        )}
      </Card>
    </>
  );
}
