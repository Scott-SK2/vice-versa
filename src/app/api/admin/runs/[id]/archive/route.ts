import { getDb } from "@/db/client";
import { json } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { getRunDetail } from "@/lib/admin/service";
import { archiveRun } from "@/lib/runs/service";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>("admin", async (_req, { params }, user) => {
  const { id } = await params;
  await archiveRun(getDb(), user, id);
  return json({ run: await getRunDetail(getDb(), id) });
});
