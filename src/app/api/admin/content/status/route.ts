import { getDb } from "@/db/client";
import { json } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { contentStatus } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = adminRoute("admin", async () => json(await contentStatus(getDb())));
