// ปุ่ม "ดู" / "PDF" ของเอกสาร FlowAccount ฝั่งแอดมินเปิด API ตรง ๆ ในแท็บใหม่ (components/admin/DocLinks.tsx)
//   ถ้า API ตอบ error เป็น JSON แอดมินจะเห็นข้อความดิบ จึง redirect ไปหน้าแจ้งข้อผิดพลาด /admin/document-error แทน
//   ส่ง URL เดิมไปด้วย (retry) ให้หน้านั้นมีปุ่ม "ลองใหม่อีกครั้ง" กลับมาเปิดเอกสารเดิม
import { NextRequest, NextResponse } from "next/server";

// title = หัวข้อ เช่น "ไม่สามารถส่งออกเอกสารได้", detail = คำอธิบาย/สิ่งที่ควรทำต่อ
export function redirectToDocumentError(req: NextRequest, title: string, detail: string) {
  const url = new URL("/admin/document-error", req.url);
  url.searchParams.set("title", title);
  url.searchParams.set("detail", detail);
  url.searchParams.set("retry", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}
