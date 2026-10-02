import { getDb } from "@/db/client";
import { json } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { liveRunId } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = adminRoute("moderateur", async (_req, _ctx, user) => json({ user, live_run_id: await liveRunId(getDb()) }));
