import type { NextRequest } from "next/server";
import { handle, parseId } from "@/lib/api";
import { listCatalogs } from "@/services/catalog.service";

export const GET = handle(async (req: NextRequest) => {
  const c = req.nextUrl.searchParams.get("categoryId");
  return Response.json(await listCatalogs({ categoryId: c ? parseId(c, "categoryId") : undefined, visibleOnly: true }));
});
