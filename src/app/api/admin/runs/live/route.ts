import { getDb } from "@/db/client";
import { errors } from "@/lib/api/errors";
import { json } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { getRunDetail, liveRunId } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = adminRoute("moderateur", async () => {
  const id = await liveRunId(getDb());
  if (!id) throw errors.noRunLive();
  return json({ run: await getRunDetail(getDb(), id) });
});
