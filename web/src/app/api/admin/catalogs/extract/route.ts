// ชั่วคราวช่วงทดสอบ OCR (ไม่อยู่ในตาราง route): ส่งไฟล์ให้ AI อ่านแล้วคืนผล โดยไม่บันทึกลงฐานข้อมูล

import type { NextRequest } from "next/server";
import { HttpError, handle, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth-admin";
import { extractCatalog } from "@/lib/ai-client";

export const POST = handle(async (req: NextRequest) => {
  await requireAdmin();
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || !file.size) throw new HttpError(400, "กรุณาแนบไฟล์แคตตาล็อก");
  const res = await extractCatalog(file);
  return res.ok ? Response.json(res.data) : jsonError(502, res.error);
});
