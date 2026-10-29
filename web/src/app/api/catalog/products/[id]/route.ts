import type { NextRequest } from "next/server";
import { handle, parseId } from "@/lib/api";
import { getProduct } from "@/services/catalog.service";

export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/catalog/products/[id]">) => {
  const { id } = await ctx.params;
  return Response.json(await getProduct(parseId(id), true));
});
