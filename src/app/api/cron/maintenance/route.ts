import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { errors } from "@/lib/api/errors";
import { json, withApi } from "@/lib/api/http";
import { sweepSharedRateLimits } from "@/lib/api/rate-limit";
import { runMaintenance } from "@/lib/runs/maintenance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tâche de rétention déclenchée de l'extérieur (Vercel Cron, cron Render ou curl) :
 *   GET /api/cron/maintenance avec Authorization: Bearer <CRON_SECRET>
 * Sur un serveur unique, la même tâche tourne déjà toute seule au démarrage (startup.ts).
 */
export const GET = withApi(async (req) => {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = Boolean(secret) && given.length === secret!.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret!));
  if (!ok) throw errors.forbidden("CRON_SECRET manquant ou invalide.");
  const report = await runMaintenance(getDb());
  const sweptLimits = await sweepSharedRateLimits();
  return json({ ok: true, ...report, sweptLimits, at: new Date().toISOString() });
});
