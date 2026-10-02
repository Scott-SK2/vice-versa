import { pgEnum } from "drizzle-orm/pg-core";

export const runKind = pgEnum("run_kind", ["test", "repetition", "live"]);
export const runStatus = pgEnum("run_status", ["draft", "live", "closed", "archived"]);
export const eventPhase = pgEnum("event_phase", [
  "accueil",
  "parcours",
  "apres",
  "discussion",
  "trace",
  "cloture",
]);
export const questionPhase = pgEnum("question_phase", ["avant", "station", "apres", "trace"]);
export const questionType = pgEnum("question_type", [
  "single_choice",
  "multi_choice",
  "tri_state",
  "three_words",
  "short_text",
  "guess_reveal",
  "media_only",
]);
export const mediaType = pgEnum("media_type", ["video", "image", "audio"]);
export const consentStatus = pgEnum("consent_status", ["pending", "granted", "refused"]);
export const captionSource = pgEnum("caption_source", ["whisper", "manual", "translation"]);
export const captionStatus = pgEnum("caption_status", ["auto", "reviewed"]);
export const openedVia = pgEnum("opened_via", ["qr", "code", "list"]);
export const visitStatus = pgEnum("visit_status", ["in_progress", "completed"]);
export const moderationStatus = pgEnum("moderation_status", [
  "not_required",
  "pending",
  "approved",
  "rejected",
]);
export const adminRole = pgEnum("admin_role", ["admin", "animateur", "moderateur"]);

export type RunKind = (typeof runKind.enumValues)[number];
export type RunStatus = (typeof runStatus.enumValues)[number];
export type EventPhase = (typeof eventPhase.enumValues)[number];
export type QuestionPhase = (typeof questionPhase.enumValues)[number];
export type QuestionType = (typeof questionType.enumValues)[number];
export type MediaType = (typeof mediaType.enumValues)[number];
export type ConsentStatus = (typeof consentStatus.enumValues)[number];
export type ModerationStatus = (typeof moderationStatus.enumValues)[number];
export type AdminRole = (typeof adminRole.enumValues)[number];
export type OpenedVia = (typeof openedVia.enumValues)[number];
export type VisitStatus = (typeof visitStatus.enumValues)[number];
