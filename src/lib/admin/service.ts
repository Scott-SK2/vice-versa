/**
 * Services de la console d'administration (04 § 4) : listes, tableau de bord,
 * modération, projection, export, comptes, contenu.
 */
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { createHash, timingSafeEqual } from "node:crypto";
import { alias } from "drizzle-orm/pg-core";
import { type Db, schema } from "@/db/client";
import type { AdminRole, ModerationStatus } from "@/db/schema/enums";
import type { RunSummary, Slide } from "@/db/schema/runs";
import { errors } from "@/lib/api/errors";
import { type Catalog, getCatalogBySlug, invalidateCatalog } from "@/lib/content/catalog";
import { ContentError, contentDir, contentWarnings, loadContent } from "@/lib/content/load";
import { ContentReloadError, reloadContent } from "@/lib/content/reload";
import { newProjectionKey } from "@/lib/domain/tokens";
import { env } from "@/lib/env";
import { t } from "@/lib/i18n";
import { aggregateQuestion, approvedTexts } from "@/lib/participant/aggregate";
import { computeSummary } from "@/lib/runs/summary";
import { type AdminUser, hashPassword, validatePassword } from "./auth";

const { runs, events, participantSessions, stationVisits, answers, questions, stations, adminUsers, adminSessions, auditLog } = schema;
type RunRow = typeof runs.$inferSelect;
type Actor = { id: string };

async function audit(db: Db, actor: Actor | null, runId: string | null, action: typeof auditLog.$inferInsert.action, payload?: Record<string, unknown>) {
  await db.insert(auditLog).values({ actorId: actor?.id ?? null, runId, action, payload: payload ?? null });
}

export async function getRunOrThrow(db: Db, runId: string): Promise<RunRow> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) throw errors.notFound("Séance");
  return run;
}

async function catalogForRun(db: Db, run: RunRow): Promise<Catalog> {
  const [event] = await db.select({ slug: events.slug }).from(events).where(eq(events.id, run.eventId)).limit(1);
  const catalog = event ? await getCatalogBySlug(event.slug) : null;
  if (!catalog) throw errors.notFound("Événement");
  return catalog;
}

// ---------------------------------------------------------------------------
// Séances
// ---------------------------------------------------------------------------

const creator = alias(adminUsers, "creator");
const starter = alias(adminUsers, "starter");
const closer = alias(adminUsers, "closer");

export async function listRuns(db: Db, filter: { status?: RunRow["status"] } = {}) {
  const where = filter.status ? eq(runs.status, filter.status) : undefined;
  const rows = await db
    .select({
      run: runs,
      eventSlug: events.slug,
      createdByName: creator.displayName,
      startedByName: starter.displayName,
      closedByName: closer.displayName,
      sessions: sql<number>`(select count(*)::int from participant_sessions ps where ps.run_id = ${runs.id})`,
      active: sql<number>`(select count(*)::int from participant_sessions ps where ps.run_id = ${runs.id} and ps.last_seen_at > now() - interval '2 minutes')`,
    })
    .from(runs)
    .innerJoin(events, eq(events.id, runs.eventId))
    .leftJoin(creator, eq(creator.id, runs.createdBy))
    .leftJoin(starter, eq(starter.id, runs.startedBy))
    .leftJoin(closer, eq(closer.id, runs.closedBy))
    .where(where)
    .orderBy(sql`case when ${runs.status} = 'live' then 0 else 1 end`, desc(runs.createdAt));
  return rows.map(presentRun);
}

export async function getRunDetail(db: Db, runId: string) {
  const list = await listRunsByIds(db, [runId]);
  if (!list.length) throw errors.notFound("Séance");
  return list[0];
}

async function listRunsByIds(db: Db, ids: string[]) {
  const all = await listRuns(db);
  return all.filter((r) => ids.includes(r.id));
}

function presentRun(r: {
  run: RunRow;
  eventSlug: string;
  createdByName: string | null;
  startedByName: string | null;
  closedByName: string | null;
  sessions: number;
  active: number;
}) {
  const { run } = r;
  return {
    id: run.id,
    event: r.eventSlug,
    label: run.label,
    kind: run.kind,
    status: run.status,
    phase: run.phase,
    notes: run.notes,
    scheduled_at: run.scheduledAt,
    created_at: run.createdAt,
    created_by: r.createdByName,
    started_at: run.startedAt,
    started_by: r.startedByName,
    closed_at: run.closedAt,
    closed_by: r.closedByName,
    projection_key: run.projectionKey,
    current_slide: run.currentSlide,
    has_summary: Boolean(run.summary),
    sessions: r.sessions,
    active_sessions: r.active,
  };
}

export type RunPresentation = ReturnType<typeof presentRun>;

export async function updateRun(
  db: Db,
  actor: Actor,
  runId: string,
  patch: { label?: string; kind?: RunRow["kind"]; scheduledAt?: Date | null; notes?: string | null },
) {
  const run = await getRunOrThrow(db, runId);
  if (patch.kind && patch.kind !== run.kind && run.status !== "draft") {
    throw errors.invalidTransition("Le type ne se change qu’en brouillon.");
  }
  const set: Partial<typeof runs.$inferInsert> = { updatedAt: sql`now()` as never };
  if (patch.label !== undefined) set.label = patch.label.trim();
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.scheduledAt !== undefined) set.scheduledAt = patch.scheduledAt;
  if (patch.notes !== undefined) set.notes = patch.notes;
  await db.update(runs).set(set).where(eq(runs.id, runId));
  await audit(db, actor, runId, "run.update", patch as Record<string, unknown>);
  return getRunDetail(db, runId);
}

export async function regenerateProjectionKey(db: Db, actor: Actor, runId: string) {
  await getRunOrThrow(db, runId);
  const key = newProjectionKey();
  await db.update(runs).set({ projectionKey: key, updatedAt: sql`now()` }).where(eq(runs.id, runId));
  await audit(db, actor, runId, "run.update", { projection_key: "regenerated" });
  return { projection_key: key };
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

export async function dashboard(db: Db, runId: string) {
  const run = await getRunOrThrow(db, runId);
  const catalog = await catalogForRun(db, run);

  const [sess] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${participantSessions.lastSeenAt} > now() - interval '2 minutes')::int`,
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

  const requiredAvant = catalog.questions.filter((q) => q.phase === "avant" && q.required).map((q) => q.id);
  const requiredApres = catalog.questions.filter((q) => q.phase === "apres" && q.required).map((q) => q.id);
  const countComplete = async (ids: number[]) => {
    if (!ids.length) return 0;
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(
        db
          .select({ sessionId: answers.sessionId })
          .from(answers)
          .where(and(eq(answers.runId, run.id), inArray(answers.questionId, ids)))
          .groupBy(answers.sessionId)
          .having(sql`count(distinct ${answers.questionId}) = ${ids.length}`)
          .as("c"),
      );
    return row.n;
  };
  const [avantDone, apresDone] = await Promise.all([countComplete(requiredAvant), countComplete(requiredApres)]);

  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(answers)
    .where(and(eq(answers.runId, run.id), eq(answers.moderationStatus, "pending")));

  const [trace] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(answers)
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .where(and(eq(answers.runId, run.id), eq(questions.phase, "trace")));

  const buckets = await db
    .select({
      bucket: sql<string>`to_char(date_trunc('minute', ${participantSessions.createdAt}) - (extract(minute from ${participantSessions.createdAt})::int % 5) * interval '1 minute', 'HH24:MI')`,
      n: sql<number>`count(*)::int`,
    })
    .from(participantSessions)
    .where(eq(participantSessions.runId, run.id))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  let completedCounted = 0;
  const stationsOut = catalog.stations.map((s) => {
    const row = perStation.find((p) => p.stationId === s.id);
    if (s.countsInProgress) completedCounted += row?.completed ?? 0;
    return { code: s.code, title: t(s.titleI18n, "fr"), counts_in_progress: s.countsInProgress, opened: row?.opened ?? 0, completed: row?.completed ?? 0 };
  });
  const avgProgress = sess.total ? Math.round((completedCounted / (sess.total * Math.max(1, catalog.event.requiredStations))) * 100) : 0;

  return {
    run: { id: run.id, label: run.label, kind: run.kind, status: run.status, phase: run.phase, started_at: run.startedAt, updated_at: run.updatedAt },
    sessions: { total: sess.total, active: sess.active, completed: sess.completed },
    avg_progress: avgProgress,
    before_done: avantDone,
    after_done: apresDone,
    pending_texts: pending.n,
    traces: trace.n,
    stations: stationsOut,
    sessions_by_5min: buckets.map((b) => ({ at: b.bucket, count: b.n })),
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Modération
// ---------------------------------------------------------------------------

export async function moderationList(
  db: Db,
  runId: string,
  opts: { status?: ModerationStatus; before?: string | null; limit?: number } = {},
) {
  const run = await getRunOrThrow(db, runId);
  const catalog = await catalogForRun(db, run);
  const status = opts.status ?? "pending";
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const conds = [eq(answers.runId, run.id), eq(answers.moderationStatus, status)];
  if (opts.before) conds.push(lt(answers.updatedAt, new Date(opts.before)));
  const rows = await db
    .select({
      id: answers.id,
      questionId: answers.questionId,
      text: sql<string>`coalesce(${answers.valueNormalized}->>'text', ${answers.valueNormalized}->>'comment')`,
      status: answers.moderationStatus,
      updatedAt: answers.updatedAt,
      moderatedAt: answers.moderatedAt,
      moderatedBy: adminUsers.displayName,
    })
    .from(answers)
    .leftJoin(adminUsers, eq(adminUsers.id, answers.moderatedBy))
    .where(and(...conds))
    .orderBy(desc(answers.updatedAt))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    status,
    items: page.map((r) => {
      const q = catalog.questionById.get(r.questionId);
      const station = q?.stationId ? catalog.stationById.get(q.stationId) : undefined;
      return {
        id: r.id,
        question_key: q?.key ?? String(r.questionId),
        question: q ? t(q.textI18n, "fr") : "",
        source: station ? `Station ${station.code}` : q?.phase === "trace" ? "Trace finale" : q?.phase === "apres" ? "Après" : "Avant",
        text: r.text,
        status: r.status,
        updated_at: r.updatedAt,
        moderated_at: r.moderatedAt,
        moderated_by: r.moderatedBy,
      };
    }),
    next_cursor: rows.length > limit ? page[page.length - 1].updatedAt.toISOString() : null,
  };
}

export async function moderate(db: Db, actor: Actor, answerId: number, decision: "approved" | "rejected") {
  const [row] = await db.select({ id: answers.id, runId: answers.runId, status: answers.moderationStatus }).from(answers).where(eq(answers.id, answerId)).limit(1);
  if (!row) throw errors.notFound("Réponse");
  if (row.status === "not_required") throw errors.forbidden("Cette réponse ne se modère pas.");
  await db
    .update(answers)
    .set({ moderationStatus: decision, moderatedBy: actor.id, moderatedAt: sql`now()` })
    .where(eq(answers.id, answerId));
  await audit(db, actor, row.runId, "answer.moderate", { answer_id: answerId, decision });
  return { id: answerId, status: decision };
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export const SLIDE_KINDS = ["blank", "overview", "before_after", "tri_state_columns", "words", "approved_texts"] as const;

/** Diapositives disponibles pour une séance, construites depuis le catalogue. */
export function availableSlides(catalog: Catalog) {
  const out: { slide: Slide; title: string }[] = [{ slide: { kind: "overview" }, title: "Vue d’ensemble" }];
  for (const q of catalog.questions) {
    const title = t(q.textI18n, "fr");
    if (q.phase === "apres" && q.pairedQuestionId) {
      const kind = q.type === "three_words" ? "words" : "before_after";
      out.push({ slide: { kind, questionKey: q.key }, title: `Avant / Après — ${title}` });
    } else if (q.type === "tri_state") {
      out.push({ slide: { kind: "tri_state_columns", questionKey: q.key }, title: `Oui / Non / Ça dépend — ${title}` });
    } else if (q.type === "three_words" && q.phase === "station") {
      out.push({ slide: { kind: "words", questionKey: q.key }, title: `Mots — ${title}` });
    } else if (q.type === "short_text") {
      out.push({ slide: { kind: "approved_texts", questionKey: q.key }, title: `Messages validés — ${title}` });
    } else if (q.type === "single_choice" || q.type === "multi_choice" || q.type === "guess_reveal") {
      out.push({ slide: { kind: "before_after", questionKey: q.key }, title: `Résultats — ${title}` });
    }
  }
  out.push({ slide: { kind: "blank" }, title: "Écran vide" });
  return out;
}

export async function projectionData(db: Db, run: RunRow, slide: Slide) {
  const catalog = await catalogForRun(db, run);
  const question = "questionKey" in slide ? catalog.questionByKey.get(slide.questionKey) : undefined;
  if ("questionKey" in slide && !question) throw errors.notFound("Question");
  const label = (q: typeof question) => (q ? t(q.textI18n, "fr") : "");

  switch (slide.kind) {
    case "blank":
      return { slide, title: "", data: null };
    case "overview": {
      const d = await dashboard(db, run.id);
      return { slide, title: "Vue d’ensemble", data: { sessions: d.sessions, avg_progress: d.avg_progress, stations: d.stations } };
    }
    case "before_after": {
      const q = question!;
      const before = q.pairedQuestionId ? catalog.questionById.get(q.pairedQuestionId) : undefined;
      const after = await aggregateQuestion(db, catalog, run.id, q);
      const beforeAgg = before ? await aggregateQuestion(db, catalog, run.id, before) : null;
      return { slide, title: label(before ?? q), data: { before: beforeAgg, after, paired: Boolean(before) } };
    }
    case "tri_state_columns": {
      const q = question!;
      const agg = await aggregateQuestion(db, catalog, run.id, q);
      return { slide, title: label(q), data: { aggregate: agg, comments: await approvedTexts(db, run.id, q.id, 30) } };
    }
    case "words": {
      const q = question!;
      const before = q.pairedQuestionId ? catalog.questionById.get(q.pairedQuestionId) : undefined;
      const after = await aggregateQuestion(db, catalog, run.id, q);
      const beforeAgg = before ? await aggregateQuestion(db, catalog, run.id, before) : null;
      return { slide, title: label(before ?? q), data: { before: beforeAgg, after } };
    }
    case "approved_texts": {
      const q = question!;
      return { slide, title: label(q), data: { texts: await approvedTexts(db, run.id, q.id, 60) } };
    }
  }
}

export async function setSlide(db: Db, actor: Actor, runId: string, slide: Slide) {
  const run = await getRunOrThrow(db, runId);
  if ("questionKey" in slide) {
    const catalog = await catalogForRun(db, run);
    if (!catalog.questionByKey.has(slide.questionKey)) throw errors.notFound("Question");
  }
  await db.update(runs).set({ currentSlide: slide, updatedAt: sql`now()` }).where(eq(runs.id, runId));
  await audit(db, actor, runId, "slide.set", slide as Record<string, unknown>);
  return { current_slide: slide };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

/** Écran de la salle : accès par clé de projection, données agrégées et modérées uniquement. */
export async function publicProjection(db: Db, runId: string, key: string) {
  const run = await getRunOrThrow(db, runId);
  if (!safeEqual(key, run.projectionKey)) throw errors.forbidden("Clé de projection invalide.");
  const slide: Slide = run.currentSlide ?? { kind: "blank" };
  const payload = await projectionData(db, run, slide);
  return {
    ...payload,
    run: { label: run.label, kind: run.kind, phase: run.phase, status: run.status },
    version: run.updatedAt.getTime(),
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Export et journal
// ---------------------------------------------------------------------------

export async function exportCsv(db: Db, actor: Actor, runId: string): Promise<string> {
  const run = await getRunOrThrow(db, runId);
  const catalog = await catalogForRun(db, run);
  const rows = await db
    .select({ sessionId: answers.sessionId, questionId: answers.questionId, value: answers.value, status: answers.moderationStatus, updatedAt: answers.updatedAt })
    .from(answers)
    .where(eq(answers.runId, run.id))
    .orderBy(answers.sessionId, answers.questionId);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["session_hash,station,question_key,type,value_json,moderation_status,updated_at"];
  for (const r of rows) {
    const q = catalog.questionById.get(r.questionId);
    const station = q?.stationId ? catalog.stationById.get(q.stationId)?.code : "";
    const hash = createHash("sha256").update(r.sessionId).digest("hex").slice(0, 10);
    lines.push([hash, station ?? "", q?.key ?? r.questionId, q?.type ?? "", JSON.stringify(r.value), r.status, r.updatedAt.toISOString()].map(esc).join(","));
  }
  await audit(db, actor, runId, "export", { format: "csv", rows: rows.length });
  return lines.join("\r\n") + "\r\n";
}

export async function exportJson(db: Db, actor: Actor, runId: string): Promise<RunSummary> {
  const run = await getRunOrThrow(db, runId);
  const summary = run.summary ?? (await computeSummary(db, run));
  await audit(db, actor, runId, "export", { format: "json" });
  return summary;
}

export async function auditList(db: Db, runId: string | null, limit = 100) {
  const rows = await db
    .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, payload: auditLog.payload, actor: adminUsers.displayName, runId: auditLog.runId })
    .from(auditLog)
    .leftJoin(adminUsers, eq(adminUsers.id, auditLog.actorId))
    .where(runId ? eq(auditLog.runId, runId) : undefined)
    .orderBy(desc(auditLog.at))
    .limit(limit);
  return rows;
}

// ---------------------------------------------------------------------------
// Comptes
// ---------------------------------------------------------------------------

export async function listUsers(db: Db) {
  const rows = await db.select().from(adminUsers).orderBy(adminUsers.createdAt);
  return rows.map(({ passwordHash: _p, ...u }) => {
    void _p;
    return u;
  });
}

export async function createUser(
  db: Db,
  actor: Actor,
  input: { email: string; displayName: string; role: AdminRole; temporaryPassword: string },
) {
  const problem = validatePassword(input.temporaryPassword);
  if (problem) throw errors.validation([problem]);
  const email = input.email.trim().toLowerCase();
  const [row] = await db
    .insert(adminUsers)
    .values({ email, displayName: input.displayName.trim(), role: input.role, passwordHash: await hashPassword(input.temporaryPassword), mustChangePassword: true })
    .onConflictDoNothing({ target: adminUsers.email })
    .returning();
  if (!row) throw errors.validation([`Un compte existe déjà pour ${email}.`]);
  await audit(db, actor, null, "user.create", { user_id: row.id, email, role: input.role });
  const { passwordHash: _p, ...user } = row;
  void _p;
  return user;
}

export async function updateUser(
  db: Db,
  actor: AdminUser,
  userId: string,
  patch: { role?: AdminRole; active?: boolean; displayName?: string; temporaryPassword?: string },
) {
  const [target] = await db.select().from(adminUsers).where(eq(adminUsers.id, userId)).limit(1);
  if (!target) throw errors.notFound("Compte");
  if (userId === actor.id && patch.active === false) throw errors.forbidden("Impossible de désactiver son propre compte.");
  const demotes = (patch.role && patch.role !== "admin") || patch.active === false;
  if (target.role === "admin" && demotes) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(adminUsers)
      .where(and(eq(adminUsers.role, "admin"), eq(adminUsers.active, true)));
    if (n <= 1) throw errors.forbidden("Il doit rester au moins un compte admin actif.");
  }
  const set: Partial<typeof adminUsers.$inferInsert> = {};
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.displayName !== undefined) set.displayName = patch.displayName.trim();
  if (patch.temporaryPassword !== undefined) {
    const problem = validatePassword(patch.temporaryPassword);
    if (problem) throw errors.validation([problem]);
    set.passwordHash = await hashPassword(patch.temporaryPassword);
    set.mustChangePassword = true;
  }
  await db.update(adminUsers).set(set).where(eq(adminUsers.id, userId));
  if (patch.active === false || patch.temporaryPassword !== undefined) {
    await db.delete(adminSessions).where(eq(adminSessions.userId, userId));
  }
  const { temporaryPassword: _tp, ...loggable } = patch;
  void _tp;
  await audit(db, { id: actor.id }, null, "user.update", { user_id: userId, ...loggable, password_reset: patch.temporaryPassword !== undefined });
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, userId)).limit(1);
  const { passwordHash: _p, ...user } = row;
  void _p;
  return user;
}

// ---------------------------------------------------------------------------
// Contenu
// ---------------------------------------------------------------------------

export async function contentStatus(db: Db, slug = env.eventSlug) {
  const [event] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  let folder: { version: string; stations: number; questions: number; media: number; warnings: string[]; problems: string[] } = {
    version: "",
    stations: 0,
    questions: 0,
    media: 0,
    warnings: [],
    problems: [],
  };
  try {
    const b = loadContent(contentDir(slug));
    folder = { version: b.version, stations: b.stations.length, questions: b.questions.length, media: b.media.length, warnings: contentWarnings(b), problems: [] };
  } catch (e) {
    folder.problems = e instanceof ContentError ? [e.message, ...e.problems] : [String(e)];
  }
  const [mediaStats] = await db
    .select({
      granted: sql<number>`count(*) filter (where consent_status = 'granted')::int`,
      pending: sql<number>`count(*) filter (where consent_status = 'pending')::int`,
      refused: sql<number>`count(*) filter (where consent_status = 'refused')::int`,
    })
    .from(schema.media)
    .innerJoin(stations, eq(stations.id, schema.media.stationId))
    .where(event ? and(eq(stations.eventId, event.id), eq(schema.media.active, true)) : sql`false`);
  return {
    slug,
    loaded: event ? { version: event.contentVersion, tokens_frozen_at: event.tokensFrozenAt, updated_at: event.updatedAt } : null,
    folder,
    up_to_date: Boolean(event && folder.version && event.contentVersion === folder.version),
    media: mediaStats,
  };
}

export async function reloadContentFromDisk(db: Db, actor: Actor, slug = env.eventSlug) {
  let bundle;
  try {
    bundle = loadContent(contentDir(slug));
  } catch (e) {
    if (e instanceof ContentError) throw errors.validation([e.message, ...e.problems]);
    throw e;
  }
  try {
    const r = await reloadContent(db, bundle, env.mediaBaseUrl);
    await audit(db, actor, null, "content.reload", { version: r.version });
    return { ...r, warnings: contentWarnings(bundle) };
  } catch (e) {
    if (e instanceof ContentReloadError) throw errors.forbidden(e.message);
    throw e;
  }
}

export async function freezeTokens(db: Db, actor: Actor, slug = env.eventSlug) {
  const [event] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  if (!event) throw errors.notFound("Événement");
  const frozenAt = event.tokensFrozenAt ?? new Date();
  if (!event.tokensFrozenAt) {
    await db.update(events).set({ tokensFrozenAt: frozenAt, updatedAt: sql`now()` }).where(eq(events.id, event.id));
    await audit(db, actor, null, "content.freeze_tokens", { at: frozenAt.toISOString() });
    invalidateCatalog();
  }
  return { tokens_frozen_at: frozenAt };
}

/** Pour l'en-tête de la console : la séance live de l'événement courant. */
export async function liveRunId(db: Db, slug = env.eventSlug): Promise<string | null> {
  const [row] = await db
    .select({ id: runs.id })
    .from(runs)
    .innerJoin(events, eq(events.id, runs.eventId))
    .where(and(eq(events.slug, slug), eq(runs.status, "live")))
    .limit(1);
  return row?.id ?? null;
}
