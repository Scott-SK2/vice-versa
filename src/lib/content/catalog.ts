/**
 * Contenu actif d'un événement lu en base, avec un cache court : il ne change
 * qu'au rechargement du contenu, et chaque requête participant en a besoin.
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const { events, stations, questions, choices, media, mediaCaptions, venueMaps } = schema;

export type EventRow = typeof events.$inferSelect;
export type StationRow = typeof stations.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;
export type ChoiceRow = typeof choices.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type CaptionRow = typeof mediaCaptions.$inferSelect;
export type VenueMapRow = typeof venueMaps.$inferSelect;

export type Catalog = {
  event: EventRow;
  stations: StationRow[];
  questions: QuestionRow[];
  choices: ChoiceRow[];
  media: MediaRow[];
  captions: CaptionRow[];
  map: VenueMapRow | null;
  stationByCode: Map<string, StationRow>;
  stationById: Map<number, StationRow>;
  questionByKey: Map<string, QuestionRow>;
  questionById: Map<number, QuestionRow>;
  choicesByQuestion: Map<number, ChoiceRow[]>;
  questionsByStation: Map<number, QuestionRow[]>;
  mediaByStation: Map<number, MediaRow[]>;
  captionsByMedia: Map<number, CaptionRow[]>;
};

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; value: Catalog }>();

export function invalidateCatalog(): void {
  cache.clear();
}

export async function getCatalogBySlug(slug: string): Promise<Catalog | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  if (!event) return null;
  const [st, qs, me, [map]] = await Promise.all([
    db.select().from(stations).where(and(eq(stations.eventId, event.id), eq(stations.active, true))).orderBy(asc(stations.position)),
    db.select().from(questions).where(and(eq(questions.eventId, event.id), eq(questions.active, true))).orderBy(asc(questions.position)),
    db.select().from(media).where(eq(media.active, true)).orderBy(asc(media.position)),
    db.select().from(venueMaps).where(eq(venueMaps.eventId, event.id)).limit(1),
  ]);
  const stationIds = new Set(st.map((s) => s.id));
  const eventMedia = me.filter((m) => stationIds.has(m.stationId));
  const questionIds = qs.map((q) => q.id);
  const mediaIds = eventMedia.map((m) => m.id);
  const [ch, caps] = await Promise.all([
    questionIds.length
      ? db.select().from(choices).where(eq(choices.active, true)).orderBy(asc(choices.position))
      : Promise.resolve([] as ChoiceRow[]),
    mediaIds.length ? db.select().from(mediaCaptions) : Promise.resolve([] as CaptionRow[]),
  ]);
  const qSet = new Set(questionIds);
  const mSet = new Set(mediaIds);
  const value = buildCatalog(
    event,
    st,
    qs,
    ch.filter((c) => qSet.has(c.questionId)),
    eventMedia,
    caps.filter((c) => mSet.has(c.mediaId)),
    map ?? null,
  );
  cache.set(slug, { at: Date.now(), value });
  return value;
}

function buildCatalog(
  event: EventRow,
  st: StationRow[],
  qs: QuestionRow[],
  ch: ChoiceRow[],
  me: MediaRow[],
  caps: CaptionRow[],
  map: VenueMapRow | null,
): Catalog {
  const group = <T, K>(items: T[], key: (i: T) => K) => {
    const m = new Map<K, T[]>();
    for (const i of items) {
      const k = key(i);
      const arr = m.get(k);
      if (arr) arr.push(i);
      else m.set(k, [i]);
    }
    return m;
  };
  return {
    event,
    stations: st,
    questions: qs,
    choices: ch,
    media: me,
    captions: caps,
    map,
    stationByCode: new Map(st.map((s) => [s.code, s])),
    stationById: new Map(st.map((s) => [s.id, s])),
    questionByKey: new Map(qs.map((q) => [q.key, q])),
    questionById: new Map(qs.map((q) => [q.id, q])),
    choicesByQuestion: group(ch, (c) => c.questionId),
    questionsByStation: group(qs.filter((q) => q.stationId !== null), (q) => q.stationId as number),
    mediaByStation: group(me, (m) => m.stationId),
    captionsByMedia: group(caps, (c) => c.mediaId),
  };
}
