import { handle } from "@/lib/api";
import { listCategories } from "@/services/catalog.service";

export const GET = handle(async () => Response.json(await listCategories()));
