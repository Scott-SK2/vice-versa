/**
 * Schémas de validation du dossier content/<slug>/ (07 § 2).
 */
import { z } from "zod";

export const LANGS = ["fr", "nl", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const i18nSchema = z
  .object({ fr: z.string().min(1), nl: z.string().min(1).optional(), en: z.string().min(1).optional() })
  .strict();

export const eventFileSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    languages: z.array(z.enum(LANGS)).min(1),
    default_lang: z.enum(LANGS),
    required_stations: z.number().int().positive(),
    map: z.object({ file: z.string(), width: z.number().int().positive(), height: z.number().int().positive() }),
  })
  .strict();

export const stationCodeSchema = z.string().regex(/^(A|Z|[1-9])$/);

export const stationFileSchema = z
  .object({
    code: stationCodeSchema,
    position: z.number().int().min(0),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: i18nSchema,
    intro: i18nSchema.optional(),
    counts_in_progress: z.boolean(),
    qr_token: z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/).optional(),
    short_code: z.string().regex(/^[A-HJ-NP-Z2-9]{4}$/).optional(),
    x_pct: z.number().min(0).max(100).optional(),
    y_pct: z.number().min(0).max(100).optional(),
  })
  .strict();

export const choiceFileSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/),
    label: i18nSchema,
    is_correct: z.boolean().optional(),
    icon: z.string().optional(),
  })
  .strict();

export const questionFileSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/),
    phase: z.enum(["avant", "station", "apres", "trace"]),
    station: stationCodeSchema.optional(),
    type: z.enum([
      "single_choice",
      "multi_choice",
      "tri_state",
      "three_words",
      "short_text",
      "guess_reveal",
      "media_only",
    ]),
    position: z.number().int().min(0),
    text: i18nSchema,
    help: i18nSchema.optional(),
    required: z.boolean().default(true),
    min_choices: z.number().int().positive().optional(),
    max_choices: z.number().int().positive().optional(),
    max_length: z.number().int().positive().optional(),
    paired_with: z.string().optional(),
    choices: z.union([z.array(choiceFileSchema), z.literal("same_as_paired")]).optional(),
    /** Note éditoriale, non chargée en base. */
    note: z.string().optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if ((q.phase === "station") !== (q.station !== undefined)) {
      ctx.addIssue({ code: "custom", message: "station est obligatoire si et seulement si phase = station" });
    }
    const needsChoices = ["single_choice", "multi_choice", "tri_state", "guess_reveal"].includes(q.type);
    if (needsChoices && !q.choices) ctx.addIssue({ code: "custom", message: `choices manquant pour ${q.type}` });
    if (!needsChoices && q.choices) ctx.addIssue({ code: "custom", message: `choices interdit pour ${q.type}` });
    if (q.choices === "same_as_paired" && !q.paired_with) {
      ctx.addIssue({ code: "custom", message: "same_as_paired exige paired_with" });
    }
    if (q.type === "guess_reveal" && Array.isArray(q.choices) && q.choices.filter((c) => c.is_correct).length !== 1) {
      ctx.addIssue({ code: "custom", message: "guess_reveal exige exactement un choix is_correct" });
    }
    if (q.type === "multi_choice" && q.min_choices && q.max_choices && q.min_choices > q.max_choices) {
      ctx.addIssue({ code: "custom", message: "min_choices > max_choices" });
    }
  });

export const mediaFileSchema = z
  .object({
    ref: z.string().regex(/^VV-[PV]\d{2}$/),
    station: stationCodeSchema,
    type: z.enum(["video", "image", "audio"]),
    position: z.number().int().min(0),
    file: z.string().min(1),
    poster: z.string().optional(),
    duration_s: z.number().positive().optional(),
    orientation: z.enum(["portrait", "landscape"]).default("portrait"),
    consent_status: z.enum(["pending", "granted", "refused"]).default("pending"),
    credits: z.string().optional(),
    captions: z
      .record(z.enum(LANGS), z.object({ status: z.enum(["auto", "reviewed"]), source: z.enum(["whisper", "manual", "translation"]).optional() }))
      .optional(),
    /** Description du catalogue, non chargée en base. */
    note: z.string().optional(),
  })
  .strict();

export type EventFile = z.infer<typeof eventFileSchema>;
export type StationFile = z.infer<typeof stationFileSchema>;
export type QuestionFile = z.infer<typeof questionFileSchema>;
export type ChoiceFile = z.infer<typeof choiceFileSchema>;
export type MediaFile = z.infer<typeof mediaFileSchema>;

export type ContentBundle = {
  dir: string;
  version: string;
  event: EventFile;
  stations: StationFile[];
  questions: QuestionFile[];
  media: MediaFile[];
  bannedWords: string;
  mapSvg: string;
};
