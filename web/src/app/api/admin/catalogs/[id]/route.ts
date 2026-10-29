import type { NextRequest } from "next/server";
import { handle, parseId } from "@/lib/api";
import { requireAdmin } from "@/lib/auth-admin";
import { deleteCatalog, getCatalog, listProducts, updateCatalog } from "@/services/catalog.service";

type Ctx = RouteContext<"/api/admin/catalogs/[id]">;

// GET ไม่ได้อยู่ในตาราง route แต่หน้าแก้ไขแคตตาล็อกต้องใช้
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  await requireAdmin();
  const id = parseId((await ctx.params).id);
  const [catalog, products] = await Promise.all([getCatalog(id), listProducts({ catalogId: id, visibleOnly: false })]);
  return Response.json({ catalog, products });
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  await requireAdmin();
  return Response.json(await updateCatalog(parseId((await ctx.params).id), await req.json()));
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  await requireAdmin();
  await deleteCatalog(parseId((await ctx.params).id));
  return new Response(null, { status: 204 });
});
