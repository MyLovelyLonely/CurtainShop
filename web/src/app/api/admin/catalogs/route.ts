import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/auth-admin";
import { createCatalog, listCatalogs } from "@/services/catalog.service";

export const GET = handle(async () => {
  await requireAdmin();
  return Response.json(await listCatalogs({ visibleOnly: false }));
});

export const POST = handle(async (req: NextRequest) => {
  await requireAdmin();
  return Response.json(await createCatalog(await req.formData()), { status: 201 });
});
