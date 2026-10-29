import type { NextRequest } from "next/server";
import { handle, parseId } from "@/lib/api";
import { listProducts } from "@/services/catalog.service";

export const GET = handle(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const catalogId = sp.get("catalogId");
  const categoryId = sp.get("categoryId");
  return Response.json(
    await listProducts({
      catalogId: catalogId ? parseId(catalogId, "catalogId") : undefined,
      categoryId: categoryId ? parseId(categoryId, "categoryId") : undefined,
      visibleOnly: true,
    }),
  );
});
