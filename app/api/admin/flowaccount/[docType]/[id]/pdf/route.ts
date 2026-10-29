// GET /api/admin/flowaccount/{docType}/{id}/pdf   ไฟล์ PDF ของเอกสาร (id = recordId)
//   ?serial=QT2026100001 ใช้ตั้งชื่อไฟล์, ?download=1 = ดาวน์โหลดแทนเปิดในเบราว์เซอร์
//   export-pdf ไม่สำเร็จ (sandbox ตอบ 502 อยู่) = redirect ไปหน้าแชร์เอกสาร ซึ่งมีปุ่มดาวน์โหลด PDF เหมือนกัน
import { NextRequest, NextResponse } from "next/server";
import { exportPdf, isDocType, shareLink } from "@/lib/flowaccount";

type Params = { params: Promise<{ docType: string; id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { docType, id } = await params;
  if (!isDocType(docType)) return NextResponse.json({ error: "ไม่รู้จักประเภทเอกสาร" }, { status: 404 });

  try {
    const pdf = await exportPdf(docType, Number(id));
    if (!pdf) {
      const link = await shareLink(docType, Number(id));
      if (link) return NextResponse.redirect(link);
      return NextResponse.json({ error: "ส่งออก PDF จาก FlowAccount ไม่สำเร็จ" }, { status: 502 });
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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
