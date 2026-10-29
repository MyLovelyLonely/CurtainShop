import type { NextRequest } from "next/server";
import { handle, parseId } from "@/lib/api";
import { requireAdmin } from "@/lib/auth-admin";
import { deleteProduct, getProduct, updateProduct } from "@/services/catalog.service";

type Ctx = RouteContext<"/api/admin/products/[id]">;

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  await requireAdmin();
  return Response.json(await getProduct(parseId((await ctx.params).id), false));
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  await requireAdmin();
  return Response.json(await updateProduct(parseId((await ctx.params).id), await req.formData()));
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  await requireAdmin();
  await deleteProduct(parseId((await ctx.params).id));
  return new Response(null, { status: 204 });
});
