// POST /api/admin/flowaccount/upgrade/receipts/with-payment   สร้างใบเสร็จจากใบกำกับภาษี พร้อมบันทึกรับเงิน (สถานะเก็บเงินแล้ว)
// บันทึกเงินที่ใบเสร็จครั้งเดียว ใบกำกับภาษีสร้างผ่าน /upgrade/tax-invoices แบบไม่รับเงิน
import { NextRequest, NextResponse } from "next/server";
import { flowAccount } from "@/lib/flowaccount";

type Params = { params: Promise<{ docType: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { docType } = await params;
  if (docType !== "receipts") {
    return NextResponse.json({ error: "รองรับเฉพาะ receipts" }, { status: 404 });
  }

  try {
    const { status, data } = await flowAccount("POST", `/upgrade/receipts/with-payment`, await req.json());
    return NextResponse.json(data, { status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
