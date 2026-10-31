import type { NextRequest } from "next/server";
import { HttpError, handle } from "@/lib/api";
import { previewSimulation } from "@/services/simulate.service";

// ลูกค้าปรับค่าใหม่ → เบราว์เซอร์ยกเลิกคำขอ (req.signal) → ยกเลิกคำขอไปที่ ai-server ด้วย
export const POST = handle(async (req: NextRequest) => {
  const body = await req.json().catch(() => {
    throw new HttpError(400, "ข้อมูลไม่ถูกต้อง");
  });
  return previewSimulation(body, req.signal);
});
