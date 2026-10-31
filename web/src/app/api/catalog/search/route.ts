import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { searchByText } from "@/services/search.service";

export const GET = handle(async (req: NextRequest) =>
  Response.json(await searchByText(req.nextUrl.searchParams.get("q") ?? "")),
);
