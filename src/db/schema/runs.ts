/**
 * Séances (Run) et données participants, plus le journal d'audit.
 * Référence : docs/conception/02-seances-et-cycle-de-vie.md et 03 § 5.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { adminUsers } from "./admin";
import { events, questions, stations } from "./content";
import { eventPhase, moderationStatus, openedVia, runKind, runStatus, visitStatus } from "./enums";

/** Diapositive projetée (runs.current_slide). */
export type Slide =
  | { kind: "blank" }
  | { kind: "overview" }
  | { kind: "before_after"; questionKey: string }
  | { kind: "tri_state_columns"; questionKey: string }
  | { kind: "words"; questionKey: string }
  | { kind: "approved_texts"; questionKey: string };

/** Agrégats figés à la clôture (runs.summary). Structure détaillée en 03 § 6. */
export type RunSummary = {
  sessions: number;
  sessionsCompleted: number;
  avgProgress: number;
  stations: Record<string, { opened: number; completed: number }>;
  questions: Record<string, unknown>;
  approvedTexts: Record<string, string[]>;
  computedAt: string;
};

export const runs = pgTable(
  "runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: integer()
      .notNull()
      .references(() => events.id),
    /** 'Répétition générale 9 oct' */
    label: text().notNull(),
    kind: runKind().notNull().default("test"),
    status: runStatus().notNull().default("draft"),
    phase: eventPhase().notNull().default("accueil"),
    /** Clé aléatoire de l'URL /projection/{id}?key= */
    projectionKey: text().notNull(),
    currentSlide: jsonb().$type<Slide>(),
    scheduledAt: timestamp({ withTimezone: true }),
    startedAt: timestamp({ withTimezone: true }),
    startedBy: uuid().references(() => adminUsers.id),
    closedAt: timestamp({ withTimezone: true }),
    closedBy: uuid().references(() => adminUsers.id),
    summary: jsonb().$type<RunSummary>(),
    notes: text(),
    createdBy: uuid().references(() => adminUsers.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** R-S1 : une seule séance live par événement, garanti en base. */
    uniqueIndex("runs_one_live_per_event")
      .on(t.eventId)
      .where(sql`${t.status} = 'live'`),
    index("runs_event_created_idx").on(t.eventId, t.createdAt.desc()),
  ],
);

export type AuditAction =
  | "run.create"
  | "run.update"
  | "run.start"
  | "run.phase"
  | "run.close"
  | "run.reopen"
  | "run.reset"
  | "run.archive"
  | "run.delete"
  | "answer.moderate"
  | "slide.set"
  | "export"
  | "user.create"
  | "user.update"
  | "auth.login"
  | "auth.failed"
  | "content.reload"
  | "content.freeze_tokens";

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorId: uuid().references(() => adminUsers.id, { onDelete: "set null" }),
    runId: uuid().references(() => runs.id, { onDelete: "set null" }),
    action: text().$type<AuditAction>().notNull(),
    payload: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [index("audit_log_run_at_idx").on(t.runId, t.at.desc())],
);

export const participantSessions = pgTable(
  "participant_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid()
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    /** sha256 (hexadécimal) du jeton remis au navigateur ; le jeton lui-même n'est jamais stocké. */
    tokenHash: text().notNull().unique(),
    lang: text().notNull().default("fr"),
    /** « Je suis ici » : dernière station ouverte par QR ou code. */
    lastStationId: integer().references(() => stations.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Première fois à 8/8. */
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("participant_sessions_run_seen_idx").on(t.runId, t.lastSeenAt.desc())],
);

export const stationVisits = pgTable(
  "station_visits",
  {
    sessionId: uuid()
      .notNull()
      .references(() => participantSessions.id, { onDelete: "cascade" }),
    stationId: integer()
      .notNull()
      .references(() => stations.id),
    /** Dénormalisé pour le tableau de bord. */
    runId: uuid()
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    openedVia: openedVia().notNull(),
    status: visitStatus().notNull().default("in_progress"),
    completedAt: timestamp({ withTimezone: true }),
    /** 0..1, stations media_only (terminée à ≥ 0,8). */
    mediaProgress: numeric({ precision: 4, scale: 3 }),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.stationId] }),
    index("station_visits_run_station_status_idx").on(t.runId, t.stationId, t.status),
  ],
);

export const answers = pgTable(
  "answers",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    /** Dénormalisé pour les agrégats par séance. */
    runId: uuid()
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    sessionId: uuid()
      .notNull()
      .references(() => participantSessions.id, { onDelete: "cascade" }),
    questionId: integer()
      .notNull()
      .references(() => questions.id),
    /** Format par type de question : src/lib/domain/answer-value.ts */
    value: jsonb().$type<Record<string, unknown>>().notNull(),
    /** three_words : mots normalisés ; short_text : texte nettoyé. */
    valueNormalized: jsonb().$type<Record<string, unknown>>(),
    moderationStatus: moderationStatus().notNull().default("not_required"),
    moderatedBy: uuid().references(() => adminUsers.id),
    moderatedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("answers_session_question").on(t.sessionId, t.questionId),
    index("answers_run_question_idx").on(t.runId, t.questionId),
    index("answers_pending_idx")
      .on(t.runId, t.updatedAt)
      .where(sql`${t.moderationStatus} = 'pending'`),
  ],
);
