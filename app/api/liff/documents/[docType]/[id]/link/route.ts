// GET /api/liff/documents/{docType}/{recordId}/link   ลิงก์เปิดดู/ดาวน์โหลดเอกสารจาก FlowAccount (Use Case 8, 10)
//   ตรวจก่อนว่าเอกสารเป็นของลูกค้าที่ login อยู่ แล้วคืนให้หน้าเว็บเปิดเอง
//   (หน้า LIFF ส่ง token ใน header จึง redirect ตรง ๆ แบบฝั่งแอดมินไม่ได้)
//   คืน { link } = ลิงก์หน้าแชร์ของ FlowAccount ลองก่อน (หน้านั้นมีปุ่มพิมพ์ / ดาวน์โหลด PDF ให้ลูกค้า)
//       { pdf }  = ขอลิงก์ไม่ได้ จึงส่งไฟล์ PDF (base64) ให้หน้าเว็บเปิดเองแทน
import { NextResponse } from "next/server";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { ownsDocument } from "@/lib/customer-data";
import { isDocType, officialDoc } from "@/lib/flowaccount";

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
    const doc = await officialDoc(docType, Number(id));
    if (!doc) return NextResponse.json({ error: "ไม่สามารถเปิดเอกสารได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" }, { status: 502 });
    if ("link" in doc) return NextResponse.json({ link: doc.link });
    return NextResponse.json({ pdf: doc.pdf.toString("base64") });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
