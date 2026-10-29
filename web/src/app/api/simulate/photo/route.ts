import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { uploadRoomPhoto } from "@/services/simulate.service";

export const POST = handle(async (req: NextRequest) => Response.json(await uploadRoomPhoto(await req.formData())));
