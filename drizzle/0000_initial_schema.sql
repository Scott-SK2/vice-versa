CREATE TYPE "public"."admin_role" AS ENUM('admin', 'animateur', 'moderateur');--> statement-breakpoint
CREATE TYPE "public"."caption_source" AS ENUM('whisper', 'manual', 'translation');--> statement-breakpoint
CREATE TYPE "public"."caption_status" AS ENUM('auto', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('pending', 'granted', 'refused');--> statement-breakpoint
CREATE TYPE "public"."event_phase" AS ENUM('accueil', 'parcours', 'apres', 'discussion', 'trace', 'cloture');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('video', 'image', 'audio');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('not_required', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."opened_via" AS ENUM('qr', 'code', 'list');--> statement-breakpoint
CREATE TYPE "public"."question_phase" AS ENUM('avant', 'station', 'apres', 'trace');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('single_choice', 'multi_choice', 'tri_state', 'three_words', 'short_text', 'guess_reveal', 'media_only');--> statement-breakpoint
CREATE TYPE "public"."run_kind" AS ENUM('test', 'repetition', 'live');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('draft', 'live', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "choices" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"key" text NOT NULL,
	"label_i18n" jsonb NOT NULL,
	"is_correct" boolean,
	"icon" text,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "choices_question_key" UNIQUE("question_id","key")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"languages" text[] DEFAULT '{fr,nl,en}'::text[] NOT NULL,
	"default_lang" text DEFAULT 'fr' NOT NULL,
	"required_stations" integer DEFAULT 8 NOT NULL,
	"tokens_frozen_at" timestamp with time zone,
	"content_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"station_id" integer NOT NULL,
	"ref" text NOT NULL,
	"type" "media_type" NOT NULL,
	"url" text NOT NULL,
	"poster_url" text,
	"duration_s" numeric(6, 2),
	"orientation" text DEFAULT 'portrait' NOT NULL,
	"consent_status" "consent_status" DEFAULT 'pending' NOT NULL,
	"credits" text,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "media_station_ref" UNIQUE("station_id","ref")
);
--> statement-breakpoint
CREATE TABLE "media_captions" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_id" integer NOT NULL,
	"lang" text NOT NULL,
	"words_json_url" text NOT NULL,
	"vtt_url" text NOT NULL,
	"source" "caption_source" NOT NULL,
	"status" "caption_status" DEFAULT 'auto' NOT NULL,
	CONSTRAINT "media_captions_media_lang" UNIQUE("media_id","lang")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"key" text NOT NULL,
	"station_id" integer,
	"phase" "question_phase" NOT NULL,
	"type" "question_type" NOT NULL,
	"text_i18n" jsonb NOT NULL,
	"help_i18n" jsonb,
	"required" boolean DEFAULT true NOT NULL,
	"min_choices" integer,
	"max_choices" integer,
	"max_length" integer,
	"paired_question_id" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "questions_event_key" UNIQUE("event_id","key"),
	CONSTRAINT "questions_station_phase" CHECK (("questions"."phase" = 'station') = ("questions"."station_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"code" text NOT NULL,
	"position" integer NOT NULL,
	"slug" text NOT NULL,
	"title_i18n" jsonb NOT NULL,
	"intro_i18n" jsonb,
	"qr_token" text NOT NULL,
	"short_code" text NOT NULL,
	"x_pct" numeric(5, 2),
	"y_pct" numeric(5, 2),
	"counts_in_progress" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "stations_event_code" UNIQUE("event_id","code"),
	CONSTRAINT "stations_event_qr_token" UNIQUE("event_id","qr_token"),
	CONSTRAINT "stations_event_short_code" UNIQUE("event_id","short_code")
);
--> statement-breakpoint
CREATE TABLE "venue_maps" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"svg_url" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	CONSTRAINT "venue_maps_eventId_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	"user_agent" text,
	CONSTRAINT "admin_sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" integer NOT NULL,
	"value" jsonb NOT NULL,
	"value_normalized" jsonb,
	"moderation_status" "moderation_status" DEFAULT 'not_required' NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answers_session_question" UNIQUE("session_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"run_id" uuid,
	"action" text NOT NULL,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "participant_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"lang" text DEFAULT 'fr' NOT NULL,
	"last_station_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "participant_sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" integer NOT NULL,
	"label" text NOT NULL,
	"kind" "run_kind" DEFAULT 'test' NOT NULL,
	"status" "run_status" DEFAULT 'draft' NOT NULL,
	"phase" "event_phase" DEFAULT 'accueil' NOT NULL,
	"projection_key" text NOT NULL,
	"current_slide" jsonb,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"started_by" uuid,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"summary" jsonb,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_visits" (
	"session_id" uuid NOT NULL,
	"station_id" integer NOT NULL,
	"run_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_via" "opened_via" NOT NULL,
	"status" "visit_status" DEFAULT 'in_progress' NOT NULL,
	"completed_at" timestamp with time zone,
	"media_progress" numeric(4, 3),
	CONSTRAINT "station_visits_session_id_station_id_pk" PRIMARY KEY("session_id","station_id")
);
--> statement-breakpoint
ALTER TABLE "choices" ADD CONSTRAINT "choices_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_captions" ADD CONSTRAINT "media_captions_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_paired_question_id_questions_id_fk" FOREIGN KEY ("paired_question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_maps" ADD CONSTRAINT "venue_maps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_session_id_participant_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."participant_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_moderated_by_admin_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_admin_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_sessions" ADD CONSTRAINT "participant_sessions_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_sessions" ADD CONSTRAINT "participant_sessions_last_station_id_stations_id_fk" FOREIGN KEY ("last_station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_started_by_admin_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_closed_by_admin_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_visits" ADD CONSTRAINT "station_visits_session_id_participant_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."participant_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_visits" ADD CONSTRAINT "station_visits_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_visits" ADD CONSTRAINT "station_visits_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_station_idx" ON "questions" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "answers_run_question_idx" ON "answers" USING btree ("run_id","question_id");--> statement-breakpoint
CREATE INDEX "answers_pending_idx" ON "answers" USING btree ("run_id","updated_at") WHERE "answers"."moderation_status" = 'pending';--> statement-breakpoint
CREATE INDEX "audit_log_run_at_idx" ON "audit_log" USING btree ("run_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "participant_sessions_run_seen_idx" ON "participant_sessions" USING btree ("run_id","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "runs_one_live_per_event" ON "runs" USING btree ("event_id") WHERE "runs"."status" = 'live';--> statement-breakpoint
CREATE INDEX "runs_event_created_idx" ON "runs" USING btree ("event_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "station_visits_run_station_status_idx" ON "station_visits" USING btree ("run_id","station_id","status");