// GET  /api/admin/flowaccount/{docType}   ดูเอกสารทั้งหมด (ส่ง query ต่อได้ เช่น ?currentPage=1&pageSize=20)
// POST /api/admin/flowaccount/{docType}   สร้างเอกสาร
import { NextRequest, NextResponse } from "next/server";
import { flowAccount, isDocType } from "@/lib/flowaccount";

type Params = { params: Promise<{ docType: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { docType } = await params;
  if (!isDocType(docType)) return NextResponse.json({ error: "ไม่รู้จักประเภทเอกสาร" }, { status: 404 });

  try {
    const { status, data } = await flowAccount("GET", `/${docType}${req.nextUrl.search}`);
    return NextResponse.json(data, { status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { docType } = await params;
  if (!isDocType(docType)) return NextResponse.json({ error: "ไม่รู้จักประเภทเอกสาร" }, { status: 404 });
  // ใบเสร็จสร้างตรงไม่ได้ ต้องอัปเกรดจากใบกำกับภาษี (/api/admin/flowaccount/upgrade/receipts)
  if (docType === "receipts") {
    return NextResponse.json({ error: "ใบเสร็จต้องสร้างผ่าน /api/admin/flowaccount/upgrade/receipts" }, { status: 400 });
  }

  try {
    const { status, data } = await flowAccount("POST", `/${docType}`, await req.json());
    return NextResponse.json(data, { status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
