// GET /api/liff/documents/{docType}/{recordId}/link   ลิงก์เปิดดู/ดาวน์โหลดเอกสารจาก FlowAccount (Use Case 8, 10)
//   ตรวจก่อนว่าเอกสารเป็นของลูกค้าที่ login อยู่ แล้วคืน { link } ให้หน้าเว็บเปิดเอง
//   (หน้า LIFF ส่ง token ใน header จึง redirect ตรง ๆ แบบฝั่งแอดมินไม่ได้)
import { NextResponse } from "next/server";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { ownsDocument } from "@/lib/customer-data";
import { isDocType, shareLink } from "@/lib/flowaccount";

type Params = { params: Promise<{ docType: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const c = await currentCustomer(req);
  if (!c) return unauthorized();
  const { docType, id } = await params;
  if (!isDocType(docType)) return NextResponse.json({ error: "ไม่รู้จักประเภทเอกสาร" }, { status: 404 });

  try {
    if (!(await ownsDocument(c.customer_id, docType, Number(id)))) {
      return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
    }
    const link = await shareLink(docType, Number(id));
    if (!link) return NextResponse.json({ error: "ไม่สามารถเปิดเอกสารได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" }, { status: 502 });
    return NextResponse.json({ link });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
