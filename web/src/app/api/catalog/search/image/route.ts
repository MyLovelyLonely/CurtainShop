import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { searchByImage } from "@/services/search.service";

export const POST = handle(async (req: NextRequest) => Response.json(await searchByImage(await req.formData())));
