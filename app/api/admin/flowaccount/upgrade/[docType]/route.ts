// POST /api/admin/flowaccount/upgrade/{docType}   สร้างเอกสารต่อจากเอกสารเดิม (ส่ง documentReference มาใน body)
// billing-notes ← ใบเสนอราคา
// tax-invoices  ← ใบเสนอราคา / ใบแจ้งหนี้
// receipts      ← ใบกำกับภาษี
import { NextRequest, NextResponse } from "next/server";
import { flowAccount, isDocType } from "@/lib/flowaccount";

type Params = { params: Promise<{ docType: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { docType } = await params;
  if (!isDocType(docType) || docType === "quotations") {
    return NextResponse.json({ error: "อัปเกรดได้เฉพาะ billing-notes, tax-invoices, receipts" }, { status: 404 });
  }

  try {
    const { status, data } = await flowAccount("POST", `/upgrade/${docType}`, await req.json());
    return NextResponse.json(data, { status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
