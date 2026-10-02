/**
 * Contenu de l'événement : stable entre les séances, chargé depuis content/<slug>/.
 * Référence : docs/conception/03-modele-de-donnees.md § 3.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import {
  captionSource,
  captionStatus,
  consentStatus,
  mediaType,
  questionPhase,
  questionType,
} from "./enums";

/** Texte multilingue : { fr: "...", nl: "...", en: "..." }. Le français est obligatoire. */
export type I18nText = { fr: string } & Partial<Record<"nl" | "en", string>>;

export const events = pgTable("events", {
  id: serial().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  languages: text().array().notNull().default(sql`'{fr,nl,en}'::text[]`),
  defaultLang: text().notNull().default("fr"),
  requiredStations: integer().notNull().default(8),
  /** Posé après impression des affiches : les jetons QR ne peuvent plus changer. */
  tokensFrozenAt: timestamp({ withTimezone: true }),
  /** Hash du dossier content/ chargé en base. */
  contentVersion: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const venueMaps = pgTable("venue_maps", {
  id: serial().primaryKey(),
  eventId: integer()
    .notNull()
    .unique()
    .references(() => events.id, { onDelete: "cascade" }),
  svgUrl: text().notNull(),
  /** Largeur et hauteur logiques du viewBox. */
  width: integer().notNull(),
  height: integer().notNull(),
});

export const stations = pgTable(
  "stations",
  {
    id: serial().primaryKey(),
    eventId: integer()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** 'A', '1'..'8', 'Z' */
    code: text().notNull(),
    /** Ordre d'affichage 0..9 */
    position: integer().notNull(),
    slug: text().notNull(),
    titleI18n: jsonb("title_i18n").$type<I18nText>().notNull(),
    introI18n: jsonb("intro_i18n").$type<I18nText>(),
    /** Jeton porté par le QR (≥ 8 caractères, non devinable). */
    qrToken: text().notNull(),
    /** Code de secours à 4 caractères affiché sous le QR. */
    shortCode: text().notNull(),
    xPct: numeric({ precision: 5, scale: 2 }),
    yPct: numeric({ precision: 5, scale: 2 }),
    /** false pour A et Z : ne comptent pas dans « X/8 ». */
    countsInProgress: boolean().notNull().default(true),
    active: boolean().notNull().default(true),
  },
  (t) => [
    unique("stations_event_code").on(t.eventId, t.code),
    unique("stations_event_qr_token").on(t.eventId, t.qrToken),
    unique("stations_event_short_code").on(t.eventId, t.shortCode),
  ],
);

export const media = pgTable(
  "media",
  {
    id: serial().primaryKey(),
    stationId: integer()
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    /** Référence du catalogue : 'VV-V10', 'VV-P01'. */
    ref: text().notNull(),
    type: mediaType().notNull(),
    url: text().notNull(),
    posterUrl: text(),
    durationS: numeric({ precision: 6, scale: 2 }),
    orientation: text().notNull().default("portrait"),
    consentStatus: consentStatus().notNull().default("pending"),
    credits: text(),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
  },
  (t) => [unique("media_station_ref").on(t.stationId, t.ref)],
);

export const mediaCaptions = pgTable(
  "media_captions",
  {
    id: serial().primaryKey(),
    mediaId: integer()
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    lang: text().notNull(),
    /** captions.<lang>.json : segments + mots horodatés (affichage façon TikTok). */
    wordsJsonUrl: text().notNull(),
    vttUrl: text().notNull(),
    source: captionSource().notNull(),
    status: captionStatus().notNull().default("auto"),
  },
  (t) => [unique("media_captions_media_lang").on(t.mediaId, t.lang)],
);

export const questions = pgTable(
  "questions",
  {
    id: serial().primaryKey(),
    eventId: integer()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** Clé stable utilisée par content/ : 'avant_futur', 's3_motivation', 'trace'. */
    key: text().notNull(),
    /** Null pour les phases avant / apres / trace. */
    stationId: integer().references(() => stations.id, { onDelete: "cascade" }),
    phase: questionPhase().notNull(),
    type: questionType().notNull(),
    textI18n: jsonb("text_i18n").$type<I18nText>().notNull(),
    helpI18n: jsonb("help_i18n").$type<I18nText>(),
    required: boolean().notNull().default(true),
    minChoices: integer(),
    maxChoices: integer(),
    /** short_text : 140 */
    maxLength: integer(),
    /** Sur une question « Après » : la question « Avant » correspondante. */
    pairedQuestionId: integer().references((): AnyPgColumn => questions.id),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
  },
  (t) => [
    unique("questions_event_key").on(t.eventId, t.key),
    index("questions_station_idx").on(t.stationId),
    check("questions_station_phase", sql`(${t.phase} = 'station') = (${t.stationId} is not null)`),
  ],
);

export const choices = pgTable(
  "choices",
  {
    id: serial().primaryKey(),
    questionId: integer()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    /** 'afrique', 'oui', 'kinshasa', … */
    key: text().notNull(),
    labelI18n: jsonb("label_i18n").$type<I18nText>().notNull(),
    /** guess_reveal uniquement. */
    isCorrect: boolean(),
    /** Station 8 : nom d'icône. */
    icon: text(),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
  },
  (t) => [unique("choices_question_key").on(t.questionId, t.key)],
);
