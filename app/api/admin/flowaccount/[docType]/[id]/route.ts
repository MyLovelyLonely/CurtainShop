// GET    /api/admin/flowaccount/{docType}/{id}   ดูเอกสาร 1 ใบ (id = recordId)
// PUT    /api/admin/flowaccount/{docType}/{id}   แก้ไขเอกสาร (ต้องอยู่สถานะ awaiting)
// DELETE /api/admin/flowaccount/{docType}/{id}   ลบเอกสาร (ต้องอยู่สถานะ awaiting)
import { NextRequest, NextResponse } from "next/server";
import { flowAccount, isDocType } from "@/lib/flowaccount";

type Params = { params: Promise<{ docType: string; id: string }> };

async function handle(method: string, req: NextRequest, { params }: Params) {
  const { docType, id } = await params;
  if (!isDocType(docType)) return NextResponse.json({ error: "ไม่รู้จักประเภทเอกสาร" }, { status: 404 });

  try {
    const body = method === "PUT" ? await req.json() : undefined;
    const { status, data } = await flowAccount(method, `/${docType}/${id}`, body);
    return NextResponse.json(data, { status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = (req: NextRequest, ctx: Params) => handle("GET", req, ctx);
export const PUT = (req: NextRequest, ctx: Params) => handle("PUT", req, ctx);
export const DELETE = (req: NextRequest, ctx: Params) => handle("DELETE", req, ctx);
