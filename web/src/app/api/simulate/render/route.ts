import type { NextRequest } from "next/server";
import { HttpError, handle } from "@/lib/api";
import { renderSimulation } from "@/services/simulate.service";

export const POST = handle(async (req: NextRequest) => {
  const body = await req.json().catch(() => {
    throw new HttpError(400, "ข้อมูลไม่ถูกต้อง");
  });
  return Response.json(await renderSimulation(body));
});
