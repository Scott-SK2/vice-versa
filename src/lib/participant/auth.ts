import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { env } from "@/lib/env";
import { errors } from "@/lib/api/errors";
import { bearerToken } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rate-limit";
import { type Catalog, getCatalogBySlug } from "@/lib/content/catalog";
import { hashToken } from "./token";

const { runs, participantSessions, events } = schema;

export type RunRow = typeof runs.$inferSelect;
export type SessionRow = typeof participantSessions.$inferSelect;

export type ParticipantContext = {
  session: SessionRow;
  run: RunRow;
  catalog: Catalog;
};

/** Séance live d'un événement, ou null. */
export async function getLiveRun(eventSlug = env.eventSlug): Promise<RunRow | null> {
  const db = getDb();
  const [row] = await db
    .select({ run: runs })
    .from(runs)
    .innerJoin(events, eq(events.id, runs.eventId))
    .where(and(eq(events.slug, eventSlug), eq(runs.status, "live")))
    .limit(1);
  return row?.run ?? null;
}

const TOUCH_INTERVAL_MS = 30_000;

/**
 * Résout le jeton participant d'une requête (02 § 4) :
 * 401 SESSION_UNKNOWN, 409 RUN_CHANGED, 409 RUN_CLOSED, 429 RATE_LIMITED.
 */
export async function requireParticipant(req: Request): Promise<ParticipantContext> {
  const token = bearerToken(req);
  if (!token) throw errors.sessionUnknown();
  const tokenHash = hashToken(token);
  rateLimit(`p:${tokenHash}`, env.participantRatePerMin);

  const db = getDb();
  const [row] = await db
    .select({ session: participantSessions, run: runs, eventSlug: events.slug })
    .from(participantSessions)
    .innerJoin(runs, eq(runs.id, participantSessions.runId))
    .innerJoin(events, eq(events.id, runs.eventId))
    .where(eq(participantSessions.tokenHash, tokenHash))
    .limit(1);
  if (!row) throw errors.sessionUnknown();

  if (row.run.status !== "live") {
    const live = await getLiveRun(row.eventSlug);
    if (live) throw errors.runChanged(live.id);
    throw errors.runClosed();
  }

  const catalog = await getCatalogBySlug(row.eventSlug);
  if (!catalog) throw errors.notFound("Événement");

  if (Date.now() - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(participantSessions)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(participantSessions.id, row.session.id));
  }
  return { session: row.session, run: row.run, catalog };
}
