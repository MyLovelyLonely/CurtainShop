// GET /api/admin/flowaccount/{docType}/{id}/pdf   ไฟล์ PDF ของเอกสาร (id = recordId)
//   ?serial=QT2026100001 ใช้ตั้งชื่อไฟล์, ?download=1 = ดาวน์โหลดแทนเปิดในเบราว์เซอร์
//   export-pdf ไม่สำเร็จ (sandbox ตอบ 502 อยู่) = redirect ไปหน้าแชร์เอกสาร ซึ่งมีปุ่มดาวน์โหลด PDF เหมือนกัน
import { NextRequest, NextResponse } from "next/server";
import { exportPdf, isDocType, shareLink } from "@/lib/flowaccount";
import { redirectToDocumentError } from "@/lib/error-page";

type Params = { params: Promise<{ docType: string; id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { docType, id } = await params;
  // เปิดในแท็บใหม่ ถ้า error จึง redirect ไปหน้าแจ้งข้อผิดพลาดของแอดมิน (lib/error-page.ts) แทนการตอบ JSON usecase-16 
  if (!isDocType(docType)) return redirectToDocumentError(req, "ไม่สามารถส่งออกเอกสารได้", "ไม่รู้จักประเภทเอกสาร");

  try {
    const pdf = await exportPdf(docType, Number(id));
    if (!pdf) {
      const link = await shareLink(docType, Number(id));
      if (link) return NextResponse.redirect(link);
      // ไม่ได้ทั้ง PDF และหน้าแชร์ = FlowAccount ไม่พร้อม (ข้อความตาม Use Case 16)
      return redirectToDocumentError(req, "ไม่สามารถส่งออกเอกสารได้", "FlowAccount ไม่พร้อมให้บริการในขณะนี้ กรุณาลองใหม่อีกครั้ง");
    }

    const name = `${req.nextUrl.searchParams.get("serial") ?? `${docType}-${id}`}.pdf`;
    const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(name)}"`,
      },
    });
  } catch (e) {
    // error ที่ไม่คาดคิด เช่น เชื่อมต่อ FlowAccount ไม่ได้เลย
    return redirectToDocumentError(req, "ไม่สามารถส่งออกเอกสารได้", (e as Error).message);
  }
}
