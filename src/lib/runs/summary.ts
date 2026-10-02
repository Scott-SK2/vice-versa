import { and, eq, sql } from "drizzle-orm";
import { type Db, schema } from "@/db/client";
import type { RunSummary } from "@/db/schema/runs";
import { getCatalogBySlug } from "@/lib/content/catalog";
import { aggregateQuestion, approvedTexts } from "@/lib/participant/aggregate";

const { events, participantSessions, stationVisits } = schema;

/** Agrégats d'une séance (figés à la clôture dans runs.summary, ou calculés à la demande). */
export async function computeSummary(db: Db, run: typeof schema.runs.$inferSelect): Promise<RunSummary> {
  const [event] = await db.select().from(events).where(eq(events.id, run.eventId)).limit(1);
  const catalog = await getCatalogBySlug(event.slug);
  if (!catalog) throw new Error("Catalogue introuvable");

  const [sess] = await db
    .select({
      sessions: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${participantSessions.completedAt} is not null)::int`,
    })
    .from(participantSessions)
    .where(eq(participantSessions.runId, run.id));

  const perStation = await db
    .select({
      stationId: stationVisits.stationId,
      opened: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${stationVisits.status} = 'completed')::int`,
    })
    .from(stationVisits)
    .where(eq(stationVisits.runId, run.id))
    .groupBy(stationVisits.stationId);

  const stations: RunSummary["stations"] = {};
  let completedCounted = 0;
  for (const s of catalog.stations) {
    const row = perStation.find((p) => p.stationId === s.id);
    stations[s.code] = { opened: row?.opened ?? 0, completed: row?.completed ?? 0 };
    if (s.countsInProgress) completedCounted += row?.completed ?? 0;
  }
  const avgProgress = sess.sessions
    ? Math.round((completedCounted / (sess.sessions * Math.max(1, catalog.event.requiredStations))) * 100)
    : 0;

  const questions: RunSummary["questions"] = {};
  const texts: RunSummary["approvedTexts"] = {};
  for (const q of catalog.questions) {
    const agg = await aggregateQuestion(db, catalog, run.id, q);
    const paired = q.pairedQuestionId ? catalog.questionById.get(q.pairedQuestionId)?.key : undefined;
    questions[q.key] = paired ? { ...agg, paired_with: paired } : agg;
    if (q.type === "short_text" || q.type === "tri_state") {
      const list = await approvedTexts(db, run.id, q.id);
      if (list.length) texts[q.key] = list;
    }
  }

  return {
    sessions: sess.sessions,
    sessionsCompleted: sess.completed,
    avgProgress,
    stations,
    questions,
    approvedTexts: texts,
    computedAt: new Date().toISOString(),
  };
}

/** Compteurs légers pour les listes de séances. */
export async function runCounters(db: Db, runId: string) {
  const [row] = await db
    .select({
      sessions: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${participantSessions.lastSeenAt} > now() - interval '2 minutes')::int`,
    })
    .from(participantSessions)
    .where(and(eq(participantSessions.runId, runId)));
  return row;
}
