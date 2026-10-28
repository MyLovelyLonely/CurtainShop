// POST /api/admin/flowaccount/{docType}/{id}/status/{statusId}   เปลี่ยนสถานะเอกสาร
// ใบเสนอราคา: awaiting | approved | approvedandprocessed | rejected
// ใบแจ้งหนี้: awaiting | approved | approvedandprocessed | void
// ใบกำกับภาษี: awaiting | invoicedelivered | void
// ใบเสร็จ: void
import { NextResponse } from "next/server";
import { flowAccount, isDocType } from "@/lib/flowaccount";

type Params = { params: Promise<{ docType: string; id: string; statusId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { docType, id, statusId } = await params;
  if (!isDocType(docType)) return NextResponse.json({ error: "ไม่รู้จักประเภทเอกสาร" }, { status: 404 });

  try {
    const { status, data } = await flowAccount("POST", `/${docType}/${id}/status/${statusId}`);
    return NextResponse.json(data, { status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
