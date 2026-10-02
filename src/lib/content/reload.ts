/**
 * Chargement idempotent d'un ContentBundle en base (upsert par code / key / ref).
 * Partagé par scripts/seed.ts et POST /api/admin/content/reload.
 * Les éléments retirés du contenu sont désactivés, jamais supprimés.
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { type Db, schema } from "@/db/client";
import { invalidateCatalog } from "./catalog";
import type { ChoiceFile, ContentBundle } from "./schema";

const { events, venueMaps, stations, media, mediaCaptions, questions, choices } = schema;

export class ContentReloadError extends Error {
  constructor(
    message: string,
    readonly drift: string[] = [],
  ) {
    super(message);
  }
}

export type ReloadResult = { eventId: number; version: string; stations: number; questions: number; media: number };

export async function reloadContent(db: Db, b: ContentBundle, mediaBase: string): Promise<ReloadResult> {
  const missingTokens = b.stations.filter((s) => !s.qr_token || !s.short_code);
  if (missingTokens.length) {
    throw new ContentReloadError(
      `Stations sans jeton QR ou code court : ${missingTokens.map((s) => s.code).join(", ")}. Lancer d'abord pnpm qr:tokens.`,
    );
  }
  const base = mediaBase.replace(/\/$/, "");

  const result = await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(events)
      .values({
        slug: b.event.slug,
        name: b.event.name,
        languages: b.event.languages,
        defaultLang: b.event.default_lang,
        requiredStations: b.event.required_stations,
        contentVersion: b.version,
      })
      .onConflictDoUpdate({
        target: events.slug,
        set: {
          name: b.event.name,
          languages: b.event.languages,
          defaultLang: b.event.default_lang,
          requiredStations: b.event.required_stations,
          contentVersion: b.version,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    if (event.tokensFrozenAt) {
      const existing = await tx.select().from(stations).where(eq(stations.eventId, event.id));
      const drift = existing
        .map((e) => ({ e, s: b.stations.find((x) => x.code === e.code) }))
        .filter(({ e, s }) => s && (s.qr_token !== e.qrToken || s.short_code !== e.shortCode))
        .map(({ e }) => e.code);
      if (drift.length) {
        throw new ContentReloadError(
          `Jetons gelés le ${event.tokensFrozenAt.toISOString()} : les stations ${drift.join(", ")} changent de jeton ou de code court. Rechargement refusé.`,
          drift,
        );
      }
    }

    await tx
      .insert(venueMaps)
      .values({ eventId: event.id, svgUrl: `${base}/${b.event.map.file}`, width: b.event.map.width, height: b.event.map.height })
      .onConflictDoUpdate({
        target: venueMaps.eventId,
        set: { svgUrl: `${base}/${b.event.map.file}`, width: b.event.map.width, height: b.event.map.height },
      });

    const stationIdByCode = new Map<string, number>();
    for (const s of b.stations) {
      const values = {
        position: s.position,
        slug: s.slug,
        titleI18n: s.title,
        introI18n: s.intro ?? null,
        qrToken: s.qr_token!,
        shortCode: s.short_code!,
        xPct: s.x_pct?.toString() ?? null,
        yPct: s.y_pct?.toString() ?? null,
        countsInProgress: s.counts_in_progress,
        active: true,
      };
      const [row] = await tx
        .insert(stations)
        .values({ eventId: event.id, code: s.code, ...values })
        .onConflictDoUpdate({ target: [stations.eventId, stations.code], set: values })
        .returning({ id: stations.id });
      stationIdByCode.set(s.code, row.id);
    }
    await tx
      .update(stations)
      .set({ active: false })
      .where(and(eq(stations.eventId, event.id), notInArray(stations.code, b.stations.map((s) => s.code))));

    const mediaIds: number[] = [];
    for (const m of b.media) {
      const values = {
        stationId: stationIdByCode.get(m.station)!,
        ref: m.ref,
        type: m.type,
        url: `${base}/${m.file}`,
        posterUrl: m.poster ? `${base}/${m.poster}` : null,
        durationS: m.duration_s?.toString() ?? null,
        orientation: m.orientation,
        consentStatus: m.consent_status,
        credits: m.credits ?? null,
        position: m.position,
        active: true,
      };
      const [row] = await tx
        .insert(media)
        .values(values)
        .onConflictDoUpdate({ target: [media.stationId, media.ref], set: values })
        .returning({ id: media.id });
      mediaIds.push(row.id);
      const langs = Object.entries(m.captions ?? {});
      for (const [lang, c] of langs) {
        const cv = {
          mediaId: row.id,
          lang,
          wordsJsonUrl: `${base}/captions/${m.ref}.${lang}.json`,
          vttUrl: `${base}/captions/${m.ref}.${lang}.vtt`,
          source: c.source ?? (lang === "fr" ? "whisper" : "translation"),
          status: c.status,
        } as const;
        await tx.insert(mediaCaptions).values(cv).onConflictDoUpdate({ target: [mediaCaptions.mediaId, mediaCaptions.lang], set: cv });
      }
      await tx
        .delete(mediaCaptions)
        .where(
          and(eq(mediaCaptions.mediaId, row.id), langs.length ? notInArray(mediaCaptions.lang, langs.map(([l]) => l)) : sql`true`),
        );
    }
    const eventStationIds = [...stationIdByCode.values()];
    await tx
      .update(media)
      .set({ active: false })
      .where(and(inArray(media.stationId, eventStationIds), mediaIds.length ? notInArray(media.id, mediaIds) : sql`true`));

    const questionIdByKey = new Map<string, number>();
    for (const q of b.questions) {
      const values = {
        stationId: q.station ? stationIdByCode.get(q.station)! : null,
        phase: q.phase,
        type: q.type,
        textI18n: q.text,
        helpI18n: q.help ?? null,
        required: q.required,
        minChoices: q.min_choices ?? null,
        maxChoices: q.max_choices ?? null,
        maxLength: q.max_length ?? (q.type === "short_text" ? 140 : null),
        position: q.position,
        active: true,
      };
      const [row] = await tx
        .insert(questions)
        .values({ eventId: event.id, key: q.key, ...values })
        .onConflictDoUpdate({ target: [questions.eventId, questions.key], set: values })
        .returning({ id: questions.id });
      questionIdByKey.set(q.key, row.id);
    }
    await tx
      .update(questions)
      .set({ active: false })
      .where(and(eq(questions.eventId, event.id), notInArray(questions.key, b.questions.map((q) => q.key))));

    for (const q of b.questions) {
      await tx
        .update(questions)
        .set({ pairedQuestionId: q.paired_with ? questionIdByKey.get(q.paired_with)! : null })
        .where(eq(questions.id, questionIdByKey.get(q.key)!));
    }

    const byKey = new Map(b.questions.map((q) => [q.key, q]));
    for (const q of b.questions) {
      const questionId = questionIdByKey.get(q.key)!;
      let list: ChoiceFile[] = [];
      if (Array.isArray(q.choices)) list = q.choices;
      else if (q.choices === "same_as_paired") list = byKey.get(q.paired_with!)!.choices as ChoiceFile[];
      for (const [i, c] of list.entries()) {
        const values = {
          labelI18n: c.label,
          isCorrect: c.is_correct ?? null,
          icon: c.icon ?? null,
          position: i + 1,
          active: true,
        };
        await tx
          .insert(choices)
          .values({ questionId, key: c.key, ...values })
          .onConflictDoUpdate({ target: [choices.questionId, choices.key], set: values });
      }
      await tx
        .update(choices)
        .set({ active: false })
        .where(and(eq(choices.questionId, questionId), list.length ? notInArray(choices.key, list.map((c) => c.key)) : sql`true`));
    }

    return { eventId: event.id, version: b.version, stations: b.stations.length, questions: b.questions.length, media: b.media.length };
  });

  invalidateCatalog();
  return result;
}
