import { getDb } from "@/db/client";
import { json, withApi } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rate-limit";
import { publicProjection } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

/** Écran de la salle : GET /api/projection/{runId}/current?key=… interrogé toutes les 5 s. */
export const GET = withApi<{ runId: string }>(async (req, { params }) => {
  const { runId } = await params;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  rateLimit(`proj:${runId}`, 120);
  return json(await publicProjection(getDb(), runId, key));
});
