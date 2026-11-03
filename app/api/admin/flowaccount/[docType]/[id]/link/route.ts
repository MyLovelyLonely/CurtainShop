// GET /api/admin/flowaccount/{docType}/{id}/link   เปิดหน้าเอกสารที่ FlowAccount แชร์ไว้ (id = recordId)
//   ขอลิงก์ใหม่ทุกครั้งจาก recordId ไม่ต้องเก็บลิงก์ในฐานข้อมูล แล้ว redirect ไปหน้านั้น
//   ?json=1 = คืนเป็น { link } แทนการ redirect
import { NextRequest, NextResponse } from "next/server";
import { isDocType, shareLink } from "@/lib/flowaccount";
import { redirectToDocumentError } from "@/lib/error-page";

type Params = { params: Promise<{ docType: string; id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { docType, id } = await params;
  // ?json=1 = มีโค้ดเรียกใช้ ตอบ error เป็น JSON ตามเดิม, ไม่มี = แอดมินเปิดในแท็บใหม่ redirect ไปหน้าแจ้งข้อผิดพลาดของแอดมิน (lib/error-page.ts)
  const asJson = Boolean(req.nextUrl.searchParams.get("json"));
  const fail = (detail: string, status: number) =>
    asJson ? NextResponse.json({ error: detail }, { status }) : redirectToDocumentError(req, "ไม่สามารถเปิดเอกสารได้", detail);

  if (!isDocType(docType)) return fail("ไม่รู้จักประเภทเอกสาร", 404);

  try {
    const link = await shareLink(docType, Number(id));
    if (!link) return fail("FlowAccount ไม่พร้อมให้บริการในขณะนี้ กรุณาลองใหม่อีกครั้ง", 502);
    if (asJson) return NextResponse.json({ link });
    return NextResponse.redirect(link);
  } catch (e) {
    return fail((e as Error).message, 500);
  }
}
