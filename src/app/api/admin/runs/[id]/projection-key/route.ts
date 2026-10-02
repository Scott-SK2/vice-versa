import { getDb } from "@/db/client";
import { json } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { regenerateProjectionKey } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>("admin", async (_req, { params }, user) =>
  json(await regenerateProjectionKey(getDb(), user, (await params).id)),
);
