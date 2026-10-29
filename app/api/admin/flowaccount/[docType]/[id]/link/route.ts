// GET /api/admin/flowaccount/{docType}/{id}/link   เปิดหน้าเอกสารที่ FlowAccount แชร์ไว้ (id = recordId)
//   ขอลิงก์ใหม่ทุกครั้งจาก recordId ไม่ต้องเก็บลิงก์ในฐานข้อมูล แล้ว redirect ไปหน้านั้น
//   ?json=1 = คืนเป็น { link } แทนการ redirect
import { NextRequest, NextResponse } from "next/server";
import { isDocType, shareLink } from "@/lib/flowaccount";

type Params = { params: Promise<{ docType: string; id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { docType, id } = await params;
  if (!isDocType(docType)) return NextResponse.json({ error: "ไม่รู้จักประเภทเอกสาร" }, { status: 404 });

  try {
    const link = await shareLink(docType, Number(id));
    if (!link) return NextResponse.json({ error: "FlowAccount ไม่ส่งลิงก์เอกสารกลับมา" }, { status: 502 });
    if (req.nextUrl.searchParams.get("json")) return NextResponse.json({ link });
    return NextResponse.redirect(link);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
