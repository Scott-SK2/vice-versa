import { getDb } from "@/db/client";
import { clientIp, json, withApi } from "@/lib/api/http";
import { ApiError, errors } from "@/lib/api/errors";
import { rateLimit, sharedIsRateLimited, sharedRateLimit } from "@/lib/api/rate-limit";
import { publicProjection } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

/** Écran de la salle : GET /api/projection/{runId}/current?key=… interrogé toutes les 5 s. */
export const GET = withApi<{ runId: string }>(async (req, { params }) => {
  const { runId } = await params;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  // Par IP, jamais par séance : un tiers ne doit pas pouvoir priver l'écran de la salle en épuisant une limite partagée.
  const ip = clientIp(req);
  rateLimit(`proj:${ip}`, 120);
  const FAILS = 10;
  const FAIL_WINDOW = 10 * 60_000;
  if (await sharedIsRateLimited(`proj-fail:${ip}`, FAILS)) throw errors.rateLimited(600); // clé devinée : 10 essais / 10 min
  try {
    return json(await publicProjection(getDb(), runId, key));
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      try {
        await sharedRateLimit(`proj-fail:${ip}`, FAILS, FAIL_WINDOW);
      } catch {
        /* comptabilisé ; la prochaine requête de cette IP sera refusée */
      }
    }
    throw e;
  }
});
