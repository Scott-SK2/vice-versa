/**
 * Logique de l'API participant (04 § 2). Toutes les fonctions reçoivent le contexte
 * résolu par requireParticipant (session, séance live, catalogue).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { type Db, getDb, schema } from "@/db/client";
import type { EventPhase, OpenedVia, QuestionPhase } from "@/db/schema/enums";
import { errors } from "@/lib/api/errors";
import { rateLimit } from "@/lib/api/rate-limit";
import { getBannedWords } from "@/lib/content/banned";
import { type Catalog, getCatalogBySlug, type QuestionRow, type StationRow } from "@/lib/content/catalog";
import { AGGREGATABLE_TYPES, validateAnswer } from "@/lib/domain/answer-value";
import { isWriteAllowed, scanIsReadOnly } from "@/lib/domain/phases";
import { computeProgress, isMediaOnlyCompleted, type StationState } from "@/lib/domain/progress";
import { canonicalizeCode, newParticipantToken } from "@/lib/domain/tokens";
import { env } from "@/lib/env";
import { t } from "@/lib/i18n";
import { aggregateQuestion, PARTICIPANT_AGGREGATE_MIN } from "./aggregate";
import { getLiveRun, type ParticipantContext, type RunRow } from "./auth";
import { hashToken } from "./token";

const { participantSessions, stationVisits, answers } = schema;
type VisitRow = typeof stationVisits.$inferSelect;
type AnswerRow = typeof answers.$inferSelect;

const PARTICIPANT_ROUTES = {
  accueil: "/vv26",
  avant: "/vv26/avant",
  parcours: "/vv26/parcours",
  apres: "/vv26/apres",
  bilan: "/vv26/bilan",
  trace: "/vv26/trace",
  merci: "/vv26/merci",
};

// ---------------------------------------------------------------------------
// Séance courante et création de session
// ---------------------------------------------------------------------------

export async function currentRunPayload(eventSlug = env.eventSlug) {
  const run = await getLiveRun(eventSlug);
  if (!run) return { status: "none" as const, event: eventSlug, server_time: new Date().toISOString() };
  return publicRun(run, eventSlug);
}

function publicRun(run: RunRow, eventSlug: string) {
  return {
    status: "live" as const,
    run_id: run.id,
    kind: run.kind,
    phase: run.phase,
    label: run.label,
    event: eventSlug,
    server_time: new Date().toISOString(),
  };
}

export async function createSession(input: { lang: string; ip: string; eventSlug?: string }) {
  // Un Wi-Fi de salle présente une seule IP pour tous : la limite par IP doit absorber une arrivée groupée.
  rateLimit(`ip:${input.ip}:sessions`, env.sessionsPerIpPerMin);
  const eventSlug = input.eventSlug ?? env.eventSlug;
  const run = await getLiveRun(eventSlug);
  if (!run) throw errors.noRunLive();
  if (!isWriteAllowed("create_session", run.phase)) throw errors.phaseLocked(run.phase);
  const catalog = await getCatalogBySlug(eventSlug);
  if (!catalog) throw errors.notFound("Événement");
  const lang = catalog.event.languages.includes(input.lang) ? input.lang : catalog.event.defaultLang;

  const token = newParticipantToken(run.id);
  const [session] = await getDb()
    .insert(participantSessions)
    .values({ runId: run.id, tokenHash: hashToken(token), lang })
    .returning();
  return {
    token,
    session_id: session.id,
    run: { id: run.id, kind: run.kind, phase: run.phase, label: run.label },
    lang,
  };
}

// ---------------------------------------------------------------------------
// Lecture de l'état d'une session
// ---------------------------------------------------------------------------

async function loadVisits(db: Db, sessionId: string): Promise<Map<number, VisitRow>> {
  const rows = await db.select().from(stationVisits).where(eq(stationVisits.sessionId, sessionId));
  return new Map(rows.map((v) => [v.stationId, v]));
}

async function loadAnswers(db: Db, sessionId: string): Promise<Map<number, AnswerRow>> {
  const rows = await db.select().from(answers).where(eq(answers.sessionId, sessionId));
  return new Map(rows.map((a) => [a.questionId, a]));
}

function stationState(visit: VisitRow | undefined): StationState {
  if (!visit) return "locked";
  return visit.status === "completed" ? "completed" : "in_progress";
}

/**
 * Règle de complétion d'une station : toutes ses questions obligatoires répondues ;
 * sans question obligatoire, média lu à 80 % ; sans média publié, ouverte = terminée.
 */
function isStationComplete(
  catalog: Catalog,
  station: StationRow,
  visit: VisitRow,
  answered: Map<number, AnswerRow>,
): boolean {
  const required = (catalog.questionsByStation.get(station.id) ?? []).filter((q) => q.required);
  if (required.length) return required.every((q) => answered.has(q.id));
  const published = publishedMedia(catalog, station);
  if (published.length) return isMediaOnlyCompleted(Number(visit.mediaProgress ?? 0));
  return true;
}

function publishedMedia(catalog: Catalog, station: StationRow) {
  return (catalog.mediaByStation.get(station.id) ?? []).filter((m) => m.consentStatus === "granted");
}

function progressOf(catalog: Catalog, visits: Map<number, VisitRow>) {
  return computeProgress(
    catalog.stations.map((s) => ({ code: s.code, countsInProgress: s.countsInProgress, state: stationState(visits.get(s.id)) })),
    catalog.event.requiredStations,
  );
}

function unansweredRequired(catalog: Catalog, phase: QuestionPhase, answered: Map<number, AnswerRow>): QuestionRow[] {
  return catalog.questions.filter((q) => q.phase === phase && q.required && !answered.has(q.id));
}

function suggestedRoute(ctx: ParticipantContext, answered: Map<number, AnswerRow>): string {
  const { catalog, run } = ctx;
  const needsAvant = unansweredRequired(catalog, "avant", answered).length > 0;
  switch (run.phase) {
    case "accueil":
    case "parcours":
      return needsAvant ? PARTICIPANT_ROUTES.avant : PARTICIPANT_ROUTES.parcours;
    case "apres":
      return unansweredRequired(catalog, "apres", answered).length ? PARTICIPANT_ROUTES.apres : PARTICIPANT_ROUTES.bilan;
    case "discussion":
      return PARTICIPANT_ROUTES.bilan;
    case "trace":
      return unansweredRequired(catalog, "trace", answered).length ? PARTICIPANT_ROUTES.trace : PARTICIPANT_ROUTES.merci;
    case "cloture":
      return PARTICIPANT_ROUTES.merci;
  }
}

export async function getMe(ctx: ParticipantContext) {
  const db = getDb();
  const [visits, answered] = await Promise.all([loadVisits(db, ctx.session.id), loadAnswers(db, ctx.session.id)]);
  const progress = progressOf(ctx.catalog, visits);
  const lastStation = ctx.session.lastStationId ? ctx.catalog.stationById.get(ctx.session.lastStationId) : undefined;
  return {
    session_id: ctx.session.id,
    lang: ctx.session.lang,
    run: { id: ctx.run.id, kind: ctx.run.kind, phase: ctx.run.phase, label: ctx.run.label },
    progress,
    last_station: lastStation?.code ?? null,
    before_questions_done: unansweredRequired(ctx.catalog, "avant", answered).length === 0,
    suggested_route: suggestedRoute(ctx, answered),
  };
}

export async function setLang(ctx: ParticipantContext, lang: string) {
  if (!ctx.catalog.event.languages.includes(lang)) throw errors.validation([`lang doit être parmi ${ctx.catalog.event.languages.join(", ")}`]);
  await getDb().update(participantSessions).set({ lang }).where(eq(participantSessions.id, ctx.session.id));
  return { lang };
}

export async function getProgress(ctx: ParticipantContext) {
  const db = getDb();
  const visits = await loadVisits(db, ctx.session.id);
  const { catalog, session, run } = ctx;
  const progress = progressOf(catalog, visits);
  const lastStation = session.lastStationId ? catalog.stationById.get(session.lastStationId) : undefined;
  return {
    run: { phase: run.phase, kind: run.kind },
    progress,
    last_station: lastStation?.code ?? null,
    map: catalog.map ? { svg_url: catalog.map.svgUrl, width: catalog.map.width, height: catalog.map.height } : null,
    stations: catalog.stations.map((s) => ({
      code: s.code,
      position: s.position,
      title: t(s.titleI18n, session.lang),
      counts_in_progress: s.countsInProgress,
      state: stationState(visits.get(s.id)),
      is_here: s.id === session.lastStationId,
      x_pct: s.xPct !== null ? Number(s.xPct) : null,
      y_pct: s.yPct !== null ? Number(s.yPct) : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Scan et stations
// ---------------------------------------------------------------------------

export type ScanInput = { token?: string; shortCode?: string; expectedCode?: string };

export async function scan(ctx: ParticipantContext, input: ScanInput) {
  const { catalog, run, session } = ctx;
  if (!isWriteAllowed("scan", run.phase)) throw errors.phaseLocked(run.phase);

  let station: StationRow | undefined;
  let via: OpenedVia;
  if (input.token) {
    const token = canonicalizeCode(input.token);
    station = catalog.stations.find((s) => s.qrToken === token);
    via = "qr";
  } else if (input.shortCode) {
    const code = canonicalizeCode(input.shortCode);
    station = catalog.stations.find((s) => s.shortCode === code);
    via = "code";
  } else {
    throw errors.validation(["token ou short_code requis"]);
  }
  if (!station) throw errors.unknownCode();
  if (input.expectedCode && station.code !== input.expectedCode) throw errors.unknownCode();
  const found = station;
  const readOnly = scanIsReadOnly(run.phase);

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: participantSessions.id }).from(participantSessions).where(eq(participantSessions.id, session.id)).for("update");
    const [existing] = await tx
      .select()
      .from(stationVisits)
      .where(and(eq(stationVisits.sessionId, session.id), eq(stationVisits.stationId, found.id)));
    let visit = existing;
    let firstOpen = false;
    if (!visit && !readOnly) {
      const answered = await loadAnswers(tx, session.id);
      const draft = { sessionId: session.id, stationId: found.id, runId: run.id, openedVia: via } as VisitRow;
      const complete = isStationComplete(catalog, found, { ...draft, mediaProgress: null } as VisitRow, answered);
      [visit] = await tx
        .insert(stationVisits)
        .values({
          ...draft,
          status: complete ? "completed" : "in_progress",
          completedAt: complete ? sql`now()` : null,
        })
        .onConflictDoNothing()
        .returning();
      firstOpen = Boolean(visit);
    }
    await tx
      .update(participantSessions)
      .set({ lastStationId: found.id, lastSeenAt: sql`now()` })
      .where(eq(participantSessions.id, session.id));
    const visits = await loadVisits(tx, session.id);
    await markSessionCompleted(tx, ctx, visits);
    return { visit, firstOpen, visits };
  });

  const answered = await loadAnswers(db, session.id);
  return {
    station: {
      code: found.code,
      title: t(found.titleI18n, session.lang),
      state: stationState(result.visit),
      is_here: true,
      first_open: result.firstOpen,
      read_only: readOnly,
    },
    progress: progressOf(catalog, result.visits),
    run: { phase: run.phase },
    needs_before_questions:
      isWriteAllowed("avant", run.phase) && unansweredRequired(catalog, "avant", answered).length > 0,
  };
}

async function markSessionCompleted(db: Db, ctx: ParticipantContext, visits: Map<number, VisitRow>) {
  if (ctx.session.completedAt) return;
  const p = progressOf(ctx.catalog, visits);
  if (p.completed >= p.required) {
    await db
      .update(participantSessions)
      .set({ completedAt: sql`now()` })
      .where(and(eq(participantSessions.id, ctx.session.id), sql`${participantSessions.completedAt} is null`));
  }
}

function presentQuestion(ctx: ParticipantContext, q: QuestionRow, answered: Map<number, AnswerRow>) {
  const { catalog, session, run } = ctx;
  const a = answered.get(q.id);
  const paired = q.pairedQuestionId ? catalog.questionById.get(q.pairedQuestionId) : undefined;
  return {
    key: q.key,
    type: q.type,
    phase: q.phase,
    text: t(q.textI18n, session.lang),
    help: q.helpI18n ? t(q.helpI18n, session.lang) : null,
    required: q.required,
    min_choices: q.minChoices,
    max_choices: q.maxChoices,
    max_length: q.maxLength,
    paired_with: paired?.key ?? null,
    choices: (catalog.choicesByQuestion.get(q.id) ?? []).map((c) => ({
      id: c.id,
      key: c.key,
      label: t(c.labelI18n, session.lang),
      icon: c.icon,
    })),
    answer: a ? a.value : null,
    locked: !isWriteAllowed(q.phase, run.phase),
    aggregate_available: Boolean(a) && AGGREGATABLE_TYPES.includes(q.type),
  };
}

export async function getStation(ctx: ParticipantContext, code: string) {
  const { catalog, session, run } = ctx;
  const station = catalog.stationByCode.get(code);
  if (!station) throw errors.notFound("Station");
  const db = getDb();
  const [visits, answered] = await Promise.all([loadVisits(db, session.id), loadAnswers(db, session.id)]);
  const visit = visits.get(station.id);
  if (!visit && !scanIsReadOnly(run.phase)) throw errors.stationLocked();

  return {
    station: {
      code: station.code,
      title: t(station.titleI18n, session.lang),
      intro: station.introI18n ? t(station.introI18n, session.lang) : null,
      counts_in_progress: station.countsInProgress,
      state: stationState(visit),
      is_here: station.id === session.lastStationId,
      media_progress: visit?.mediaProgress !== null && visit?.mediaProgress !== undefined ? Number(visit.mediaProgress) : 0,
    },
    media: publishedMedia(catalog, station).map((m) => ({
      ref: m.ref,
      type: m.type,
      url: m.url,
      poster_url: m.posterUrl,
      duration_s: m.durationS !== null ? Number(m.durationS) : null,
      orientation: m.orientation,
      credits: m.credits,
      captions: Object.fromEntries(
        (catalog.captionsByMedia.get(m.id) ?? []).map((c) => [c.lang, { words: c.wordsJsonUrl, vtt: c.vttUrl }]),
      ),
    })),
    questions: (catalog.questionsByStation.get(station.id) ?? []).map((q) => presentQuestion(ctx, q, answered)),
    progress: progressOf(catalog, visits),
    run: { phase: run.phase },
  };
}

export async function mediaProgress(ctx: ParticipantContext, code: string, input: { mediaRef: string; progress: number }) {
  const { catalog, session, run } = ctx;
  const station = catalog.stationByCode.get(code);
  if (!station) throw errors.notFound("Station");
  if (!isWriteAllowed("station", run.phase)) throw errors.phaseLocked(run.phase);
  if (!publishedMedia(catalog, station).some((m) => m.ref === input.mediaRef)) throw errors.notFound("Média");

  const db = getDb();
  const visits = await db.transaction(async (tx) => {
    const [visit] = await tx
      .select()
      .from(stationVisits)
      .where(and(eq(stationVisits.sessionId, session.id), eq(stationVisits.stationId, station.id)))
      .for("update");
    if (!visit) throw errors.stationLocked();
    const progress = Math.max(Number(visit.mediaProgress ?? 0), Math.min(1, input.progress));
    const answered = await loadAnswers(tx, session.id);
    const complete =
      visit.status === "completed" ||
      isStationComplete(catalog, station, { ...visit, mediaProgress: progress.toFixed(3) }, answered);
    await tx
      .update(stationVisits)
      .set({
        mediaProgress: progress.toFixed(3),
        status: complete ? "completed" : "in_progress",
        completedAt: complete ? (visit.completedAt ?? sql`now()`) : null,
      })
      .where(and(eq(stationVisits.sessionId, session.id), eq(stationVisits.stationId, station.id)));
    const v = await loadVisits(tx, session.id);
    await markSessionCompleted(tx, ctx, v);
    return v;
  });
  return {
    station: { code: station.code, state: stationState(visits.get(station.id)) },
    progress: progressOf(catalog, visits),
  };
}

// ---------------------------------------------------------------------------
// Questions et réponses
// ---------------------------------------------------------------------------

export async function listQuestions(ctx: ParticipantContext, phase: Exclude<QuestionPhase, "station">) {
  const answered = await loadAnswers(getDb(), ctx.session.id);
  return {
    phase,
    locked: !isWriteAllowed(phase, ctx.run.phase),
    run: { phase: ctx.run.phase },
    questions: ctx.catalog.questions.filter((q) => q.phase === phase).map((q) => presentQuestion(ctx, q, answered)),
  };
}

export async function putAnswer(ctx: ParticipantContext, key: string, input: { value: unknown; clientTs?: string }) {
  const { catalog, session, run } = ctx;
  const question = catalog.questionByKey.get(key);
  if (!question) throw errors.notFound("Question");
  if (!isWriteAllowed(question.phase, run.phase)) throw errors.phaseLocked(run.phase);

  const choicesOf = catalog.choicesByQuestion.get(question.id) ?? [];
  const validated = validateAnswer(
    {
      type: question.type,
      minChoices: question.minChoices,
      maxChoices: question.maxChoices,
      maxLength: question.maxLength,
      choiceIds: choicesOf.map((c) => c.id),
      correctChoiceId: choicesOf.find((c) => c.isCorrect)?.id ?? null,
    },
    input.value,
  );
  checkBannedWords(catalog.event.slug, validated.valueNormalized);

  const clientTs = input.clientTs ? new Date(input.clientTs) : null;
  const station = question.stationId ? catalog.stationById.get(question.stationId) : undefined;

  const db = getDb();
  const outcome = await db.transaction(async (tx) => {
    if (station) {
      const [visit] = await tx
        .select({ status: stationVisits.status })
        .from(stationVisits)
        .where(and(eq(stationVisits.sessionId, session.id), eq(stationVisits.stationId, station.id)))
        .for("update");
      if (!visit) throw errors.stationLocked();
    }
    const [existing] = await tx
      .select()
      .from(answers)
      .where(and(eq(answers.sessionId, session.id), eq(answers.questionId, question.id)))
      .for("update");

    let saved = true;
    if (existing && clientTs && !Number.isNaN(clientTs.getTime()) && existing.updatedAt > clientTs) {
      saved = false; // renvoi hors-ligne plus ancien que la réponse déjà enregistrée
    } else if (existing) {
      await tx
        .update(answers)
        .set({
          value: validated.value,
          valueNormalized: validated.valueNormalized,
          moderationStatus: validated.moderationStatus,
          moderatedBy: null,
          moderatedAt: null,
          updatedAt: sql`now()`,
        })
        .where(eq(answers.id, existing.id));
    } else {
      await tx.insert(answers).values({
        runId: run.id,
        sessionId: session.id,
        questionId: question.id,
        value: validated.value,
        valueNormalized: validated.valueNormalized,
        moderationStatus: validated.moderationStatus,
      });
    }

    let stationState_: StationState | null = null;
    if (station) {
      const answered = await loadAnswers(tx, session.id);
      const [visit] = await tx
        .select()
        .from(stationVisits)
        .where(and(eq(stationVisits.sessionId, session.id), eq(stationVisits.stationId, station.id)));
      const complete = isStationComplete(catalog, station, visit, answered);
      if (complete && visit.status !== "completed") {
        await tx
          .update(stationVisits)
          .set({ status: "completed", completedAt: sql`now()` })
          .where(and(eq(stationVisits.sessionId, session.id), eq(stationVisits.stationId, station.id)));
      }
      stationState_ = complete ? "completed" : "in_progress";
    }
    const visits = await loadVisits(tx, session.id);
    await markSessionCompleted(tx, ctx, visits);
    return { saved, stationState: stationState_, visits };
  });

  return {
    saved: outcome.saved,
    question: key,
    station: station ? { code: station.code, state: outcome.stationState } : null,
    progress: progressOf(catalog, outcome.visits),
    aggregate_available: AGGREGATABLE_TYPES.includes(question.type),
    ...(validated.reveal
      ? {
          reveal: {
            correct: validated.reveal.correct,
            correct_choice_key: choicesOf.find((c) => c.id === validated.reveal?.correctChoiceId)?.key ?? null,
          },
        }
      : {}),
  };
}

function checkBannedWords(slug: string, normalized: Record<string, unknown> | null) {
  if (!normalized) return;
  const banned = getBannedWords(slug);
  const candidates: string[] = [];
  if (Array.isArray(normalized.words)) candidates.push(...(normalized.words as string[]));
  if (typeof normalized.text === "string") candidates.push(normalized.text);
  if (typeof normalized.comment === "string") candidates.push(normalized.comment);
  const found = candidates.filter((c) => banned.contains(c));
  if (found.length) throw errors.bannedWord(found);
}

export async function getAggregate(ctx: ParticipantContext, key: string) {
  const { catalog, run, session } = ctx;
  const question = catalog.questionByKey.get(key);
  if (!question) throw errors.notFound("Question");
  if (!AGGREGATABLE_TYPES.includes(question.type)) throw errors.forbidden("Pas de résultat agrégé pour cette question.");
  const db = getDb();
  const [mine] = await db
    .select({ id: answers.id })
    .from(answers)
    .where(and(eq(answers.sessionId, session.id), eq(answers.questionId, question.id)))
    .limit(1);
  if (!mine) throw errors.forbidden("Réponds d’abord à la question.");
  const agg = await aggregateQuestion(db, catalog, run.id, question, session.lang);
  if (agg.total < PARTICIPANT_AGGREGATE_MIN) {
    return { question: key, type: agg.type, total: agg.total, masked: true as const, min: PARTICIPANT_AGGREGATE_MIN };
  }
  return { question: key, masked: false as const, ...agg };
}

// ---------------------------------------------------------------------------
// Bilan Avant / Après
// ---------------------------------------------------------------------------

export async function getSummary(ctx: ParticipantContext) {
  const { catalog, session, run } = ctx;
  const phaseIdx = (["accueil", "parcours", "apres", "discussion", "trace", "cloture"] as EventPhase[]).indexOf(run.phase);
  if (phaseIdx < 2) throw errors.phaseLocked(run.phase);
  const db = getDb();
  const [visits, answered] = await Promise.all([loadVisits(db, session.id), loadAnswers(db, session.id)]);

  const render = (q: QuestionRow, a: AnswerRow | undefined) => {
    if (!a) return null;
    const v = a.value as Record<string, unknown>;
    const label = (id: unknown) => {
      const c = (catalog.choicesByQuestion.get(q.id) ?? []).find((x) => x.id === Number(id));
      return c ? t(c.labelI18n, session.lang) : null;
    };
    switch (q.type) {
      case "single_choice":
      case "tri_state":
      case "guess_reveal":
        return { choice: label(v.choice_id) };
      case "multi_choice":
        return { choices: ((v.choice_ids as number[]) ?? []).map(label) };
      case "three_words":
        return { words: ((a.valueNormalized?.words as string[]) ?? v.words) as string[] };
      case "short_text":
        return { text: v.text as string };
      default:
        return null;
    }
  };

  const pairs = catalog.questions
    .filter((q) => q.phase === "apres" && q.pairedQuestionId)
    .map((after) => {
      const before = catalog.questionById.get(after.pairedQuestionId!)!;
      return {
        key: after.key,
        type: after.type,
        text: t(before.textI18n, session.lang),
        before: render(before, answered.get(before.id)),
        after: render(after, answered.get(after.id)),
      };
    });

  const extra = catalog.questions
    .filter((q) => q.phase === "apres" && !q.pairedQuestionId && answered.has(q.id))
    .map((q) => ({ key: q.key, text: t(q.textI18n, session.lang), answer: render(q, answered.get(q.id)) }));

  return {
    run: { phase: run.phase },
    progress: progressOf(catalog, visits),
    pairs,
    extra,
  };
}

/** Utilisé par les scripts et tests : sessions d'une séance. */
export async function countSessions(runIds: string[]): Promise<number> {
  if (!runIds.length) return 0;
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(participantSessions)
    .where(inArray(participantSessions.runId, runIds));
  return row.n;
}
