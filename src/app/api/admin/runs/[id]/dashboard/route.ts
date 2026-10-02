import { getDb } from "@/db/client";
import { json } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { dashboard } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = adminRoute<{ id: string }>("moderateur", async (_req, { params }) => json(await dashboard(getDb(), (await params).id)));
