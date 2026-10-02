import { getDb } from "@/db/client";
import { json } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { reloadContentFromDisk } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const POST = adminRoute("admin", async (_req, _ctx, user) => json(await reloadContentFromDisk(getDb(), user)));
