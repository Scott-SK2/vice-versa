/**
 * pnpm db:seed [--slug vv26]
 * Charge content/<slug>/ en base de façon idempotente (upsert par code / key / ref).
 * Les éléments retirés du contenu sont désactivés (active = false), jamais supprimés,
 * pour ne pas casser les réponses des séances passées.
 * Refuse de changer un jeton QR ou un code court si les jetons sont gelés (tokens_frozen_at).
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { arg, requireEnv } from "./_env";
import { closeDb, getDb, schema } from "@/db/client";
import { ContentError, contentDir, contentWarnings, loadContent } from "@/lib/content/load";
import type { ChoiceFile } from "@/lib/content/schema";

async function main(): Promise<void> {
  requireEnv("DATABASE_URL");
  const slug = arg("slug") ?? "vv26";
  const mediaBase = (process.env.MEDIA_BASE_URL ?? "/media").replace(/\/$/, "");

  let bundle: ReturnType<typeof loadContent>;
  try {
    bundle = loadContent(contentDir(slug));
  } catch (e) {
    if (e instanceof ContentError) {
      console.error(`✘ ${e.message}`);
      for (const p of e.problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    throw e;
  }
  const b = bundle;
  const missingTokens = b.stations.filter((s) => !s.qr_token || !s.short_code);
  if (missingTokens.length) {
    console.error(`✘ Stations sans jeton QR ou code court : ${missingTokens.map((s) => s.code).join(", ")}. Lancer d'abord pnpm qr:tokens.`);
    process.exit(1);
  }

  const db = getDb();
  const { events, venueMaps, stations, media, mediaCaptions, questions, choices } = schema;

  await db.transaction(async (tx) => {
    // Événement
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

    // Gel des jetons : aucune station existante ne peut changer de jeton ou de code court.
    if (event.tokensFrozenAt) {
      const existing = await tx.select().from(stations).where(eq(stations.eventId, event.id));
      const drift = existing
        .map((e) => ({ e, s: b.stations.find((x) => x.code === e.code) }))
        .filter(({ e, s }) => s && (s.qr_token !== e.qrToken || s.short_code !== e.shortCode))
        .map(({ e }) => e.code);
      if (drift.length) {
        throw new Error(`Jetons gelés le ${event.tokensFrozenAt.toISOString()} : les stations ${drift.join(", ")} changent de jeton ou de code court. Rechargement refusé.`);
      }
    }

    // Plan
    await tx
      .insert(venueMaps)
      .values({ eventId: event.id, svgUrl: `${mediaBase}/${b.event.map.file}`, width: b.event.map.width, height: b.event.map.height })
      .onConflictDoUpdate({
        target: venueMaps.eventId,
        set: { svgUrl: `${mediaBase}/${b.event.map.file}`, width: b.event.map.width, height: b.event.map.height },
      });

    // Stations
    const stationIdByCode = new Map<string, number>();
    for (const s of b.stations) {
      const [row] = await tx
        .insert(stations)
        .values({
          eventId: event.id,
          code: s.code,
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
        })
        .onConflictDoUpdate({
          target: [stations.eventId, stations.code],
          set: {
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
          },
        })
        .returning({ id: stations.id });
      stationIdByCode.set(s.code, row.id);
    }
    await tx
      .update(stations)
      .set({ active: false })
      .where(and(eq(stations.eventId, event.id), notInArray(stations.code, b.stations.map((s) => s.code))));

    // Médias et sous-titres
    const mediaIds: number[] = [];
    for (const m of b.media) {
      const stationId = stationIdByCode.get(m.station)!;
      const values = {
        stationId,
        ref: m.ref,
        type: m.type,
        url: `${mediaBase}/${m.file}`,
        posterUrl: m.poster ? `${mediaBase}/${m.poster}` : null,
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
          wordsJsonUrl: `${mediaBase}/captions/${m.ref}.${lang}.json`,
          vttUrl: `${mediaBase}/captions/${m.ref}.${lang}.vtt`,
          source: c.source ?? (lang === "fr" ? "whisper" : "translation"),
          status: c.status,
        } as const;
        await tx
          .insert(mediaCaptions)
          .values(cv)
          .onConflictDoUpdate({ target: [mediaCaptions.mediaId, mediaCaptions.lang], set: cv });
      }
      if (langs.length) {
        await tx
          .delete(mediaCaptions)
          .where(and(eq(mediaCaptions.mediaId, row.id), notInArray(mediaCaptions.lang, langs.map(([l]) => l))));
      } else {
        await tx.delete(mediaCaptions).where(eq(mediaCaptions.mediaId, row.id));
      }
    }
    const eventStationIds = [...stationIdByCode.values()];
    await tx
      .update(media)
      .set({ active: false })
      .where(and(inArray(media.stationId, eventStationIds), mediaIds.length ? notInArray(media.id, mediaIds) : sql`true`));

    // Questions (première passe sans appariement)
    const questionIdByKey = new Map<string, number>();
    for (const q of b.questions) {
      const values = {
        eventId: event.id,
        key: q.key,
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
        .values(values)
        .onConflictDoUpdate({ target: [questions.eventId, questions.key], set: values })
        .returning({ id: questions.id });
      questionIdByKey.set(q.key, row.id);
    }
    await tx
      .update(questions)
      .set({ active: false })
      .where(and(eq(questions.eventId, event.id), notInArray(questions.key, b.questions.map((q) => q.key))));

    // Appariement Avant / Après
    for (const q of b.questions) {
      await tx
        .update(questions)
        .set({ pairedQuestionId: q.paired_with ? questionIdByKey.get(q.paired_with)! : null })
        .where(eq(questions.id, questionIdByKey.get(q.key)!));
    }

    // Choix
    const byKey = new Map(b.questions.map((q) => [q.key, q]));
    for (const q of b.questions) {
      const questionId = questionIdByKey.get(q.key)!;
      let list: ChoiceFile[] = [];
      if (Array.isArray(q.choices)) list = q.choices;
      else if (q.choices === "same_as_paired") list = byKey.get(q.paired_with!)!.choices as ChoiceFile[];
      for (const [i, c] of list.entries()) {
        const values = {
          questionId,
          key: c.key,
          labelI18n: c.label,
          isCorrect: c.is_correct ?? null,
          icon: c.icon ?? null,
          position: i + 1,
          active: true,
        };
        await tx
          .insert(choices)
          .values(values)
          .onConflictDoUpdate({ target: [choices.questionId, choices.key], set: values });
      }
      await tx
        .update(choices)
        .set({ active: false })
        .where(
          and(
            eq(choices.questionId, questionId),
            list.length ? notInArray(choices.key, list.map((c) => c.key)) : sql`true`,
          ),
        );
    }
  });

  console.log(`✔ content/${slug} chargé (version ${b.version}) : ${b.stations.length} stations, ${b.questions.length} questions, ${b.media.length} médias`);
  for (const w of contentWarnings(b)) console.log(`  ⚠ ${w}`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(`✘ ${e instanceof Error ? e.message : String(e)}`);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
