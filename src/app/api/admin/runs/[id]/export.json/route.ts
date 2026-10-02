import { getDb } from "@/db/client";
import { json } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { exportJson } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = adminRoute<{ id: string }>("admin", async (_req, { params }, user) => json(await exportJson(getDb(), user, (await params).id)));
