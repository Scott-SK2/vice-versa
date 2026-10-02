/**
 * Cycle de vie des séances (02 § 2) : création, lancement, phases, clôture,
 * réouverture, réinitialisation. Utilisé par l'API admin et par scripts/seance.ts.
 */
import { and, count, eq, sql } from "drizzle-orm";
import { type Db, schema } from "@/db/client";
import type { EventPhase, RunKind } from "@/db/schema/enums";
import type { AuditAction } from "@/db/schema/runs";
import { errors } from "@/lib/api/errors";
import { canTransition } from "@/lib/domain/phases";
import { newProjectionKey } from "@/lib/domain/tokens";
import { computeSummary } from "./summary";

const { runs, events, auditLog, participantSessions, stationVisits, answers } = schema;
export type RunRow = typeof runs.$inferSelect;

export type Actor = { id: string } | null;

async function audit(db: Db, actor: Actor, runId: string | null, action: AuditAction, payload?: Record<string, unknown>) {
  await db.insert(auditLog).values({ actorId: actor?.id ?? null, runId, action, payload: payload ?? null });
}

async function getRunForUpdate(db: Db, runId: string): Promise<RunRow> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).for("update");
  if (!run) throw errors.notFound("Séance");
  return run;
}

export async function createRun(
  db: Db,
  actor: Actor,
  input: { eventSlug: string; label: string; kind?: RunKind; scheduledAt?: Date | null; notes?: string | null },
): Promise<RunRow> {
  const [event] = await db.select().from(events).where(eq(events.slug, input.eventSlug)).limit(1);
  if (!event) throw errors.notFound("Événement");
  const [run] = await db
    .insert(runs)
    .values({
      eventId: event.id,
      label: input.label.trim(),
      kind: input.kind ?? "test",
      projectionKey: newProjectionKey(),
      scheduledAt: input.scheduledAt ?? null,
      notes: input.notes ?? null,
      createdBy: actor?.id ?? null,
    })
    .returning();
  await audit(db, actor, run.id, "run.create", { label: run.label, kind: run.kind });
  return run;
}

/** draft → live. R-S2 : refuse si une autre séance de l'événement est live. */
export async function startRun(db: Db, actor: Actor, runId: string): Promise<RunRow> {
  return db.transaction(async (tx) => {
    const run = await getRunForUpdate(tx, runId);
    if (run.status !== "draft") throw errors.invalidTransition(`statut ${run.status}`);
    await assertNoOtherLive(tx, run);
    const [updated] = await tx
      .update(runs)
      .set({ status: "live", phase: "accueil", startedAt: sql`now()`, startedBy: actor?.id ?? null, updatedAt: sql`now()` })
      .where(eq(runs.id, run.id))
      .returning();
    await audit(tx, actor, run.id, "run.start");
    return updated;
  });
}

async function assertNoOtherLive(tx: Db, run: RunRow) {
  const [other] = await tx
    .select({ id: runs.id, label: runs.label })
    .from(runs)
    .where(and(eq(runs.eventId, run.eventId), eq(runs.status, "live")))
    .limit(1);
  if (other && other.id !== run.id) throw errors.anotherRunLive(other.label, other.id);
}

export async function setPhase(
  db: Db,
  actor: Actor,
  runId: string,
  phase: EventPhase,
  opts: { confirmBackwards?: boolean } = {},
): Promise<RunRow> {
  return db.transaction(async (tx) => {
    const run = await getRunForUpdate(tx, runId);
    if (run.status !== "live") throw errors.invalidTransition(`statut ${run.status}`);
    const check = canTransition(run.phase, phase, opts);
    if (!check.ok) throw errors.invalidTransition(check.reason);
    const [updated] = await tx
      .update(runs)
      .set({ phase, updatedAt: sql`now()` })
      .where(eq(runs.id, run.id))
      .returning();
    await audit(tx, actor, run.id, "run.phase", { from: run.phase, to: phase });
    return updated;
  });
}

/** Stopper : fige summary puis live → closed (R-S3). */
export async function closeRun(db: Db, actor: Actor, runId: string): Promise<RunRow> {
  return db.transaction(async (tx) => {
    const run = await getRunForUpdate(tx, runId);
    if (run.status !== "live") throw errors.invalidTransition(`statut ${run.status}`);
    const summary = await computeSummary(tx, run);
    const [updated] = await tx
      .update(runs)
      .set({ status: "closed", phase: "cloture", closedAt: sql`now()`, closedBy: actor?.id ?? null, summary, updatedAt: sql`now()` })
      .where(eq(runs.id, run.id))
      .returning();
    await audit(tx, actor, run.id, "run.close", { sessions: summary.sessions });
    return updated;
  });
}

/** closed → live, séances test et répétition seulement. */
export async function reopenRun(db: Db, actor: Actor, runId: string): Promise<RunRow> {
  return db.transaction(async (tx) => {
    const run = await getRunForUpdate(tx, runId);
    if (run.status !== "closed") throw errors.invalidTransition(`statut ${run.status}`);
    if (run.kind === "live") throw errors.forbidden("Une séance Live clôturée ne se rouvre pas.");
    await assertNoOtherLive(tx, run);
    const [updated] = await tx
      .update(runs)
      .set({ status: "live", phase: "trace", closedAt: null, closedBy: null, summary: null, updatedAt: sql`now()` })
      .where(eq(runs.id, run.id))
      .returning();
    await audit(tx, actor, run.id, "run.reopen");
    return updated;
  });
}

/** Réinitialiser (R-S4) : purge les données participants, phase accueil, statut inchangé. */
export async function resetRun(db: Db, actor: Actor, runId: string): Promise<RunRow> {
  return db.transaction(async (tx) => {
    const run = await getRunForUpdate(tx, runId);
    if (run.status === "archived") throw errors.invalidTransition("statut archived");
    const [{ sessions }] = await tx.select({ sessions: count() }).from(participantSessions).where(eq(participantSessions.runId, run.id));
    if (run.kind === "live" && run.status === "live" && sessions > 0) {
      throw errors.forbidden("Impossible de réinitialiser une séance Live en cours qui a déjà des participants.");
    }
    await tx.delete(answers).where(eq(answers.runId, run.id));
    await tx.delete(stationVisits).where(eq(stationVisits.runId, run.id));
    await tx.delete(participantSessions).where(eq(participantSessions.runId, run.id));
    const [updated] = await tx
      .update(runs)
      .set({ phase: "accueil", summary: null, currentSlide: null, updatedAt: sql`now()` })
      .where(eq(runs.id, run.id))
      .returning();
    await audit(tx, actor, run.id, "run.reset", { sessions_removed: sessions });
    return updated;
  });
}

/** Archiver (R-S5) : purge et conserve summary. */
export async function archiveRun(db: Db, actor: Actor, runId: string): Promise<RunRow> {
  return db.transaction(async (tx) => {
    const run = await getRunForUpdate(tx, runId);
    if (run.status !== "closed") throw errors.invalidTransition(`statut ${run.status}`);
    await tx.delete(participantSessions).where(eq(participantSessions.runId, run.id));
    const [updated] = await tx
      .update(runs)
      .set({ status: "archived", updatedAt: sql`now()` })
      .where(eq(runs.id, run.id))
      .returning();
    await audit(tx, actor, run.id, "run.archive");
    return updated;
  });
}

export async function deleteRun(db: Db, actor: Actor, runId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const run = await getRunForUpdate(tx, runId);
    if (!(run.status === "draft" || run.kind === "test")) {
      throw errors.forbidden("Seules les séances en brouillon ou de type test se suppriment.");
    }
    await audit(tx, actor, null, "run.delete", { label: run.label, run_id: run.id });
    await tx.delete(runs).where(eq(runs.id, run.id));
  });
}
