import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  type ContentBundle,
  eventFileSchema,
  mediaFileSchema,
  questionFileSchema,
  stationFileSchema,
} from "./schema";

export class ContentError extends Error {
  constructor(
    message: string,
    readonly problems: string[],
  ) {
    super(message);
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new ContentError(`JSON invalide : ${file}`, [(e as Error).message]);
  }
}

function parse<T>(schema: z.ZodType<T>, data: unknown, file: string): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new ContentError(
      `Contenu invalide : ${file}`,
      r.error.issues.map((i) => `${file} ${i.path.join(".") || "(racine)"} : ${i.message}`),
    );
  }
  return r.data;
}

/** Charge et valide content/<slug>/. Lance ContentError avec la liste des problèmes. */
export function loadContent(dir: string): ContentBundle {
  const file = (name: string) => path.join(dir, name);
  for (const name of ["event.json", "stations.json", "questions.json", "media.json", "banned-words.txt"]) {
    if (!existsSync(file(name))) throw new ContentError(`Fichier manquant : ${file(name)}`, []);
  }
  const event = parse(eventFileSchema, readJson(file("event.json")), "event.json");
  const stations = parse(z.array(stationFileSchema), readJson(file("stations.json")), "stations.json");
  const questions = parse(z.array(questionFileSchema), readJson(file("questions.json")), "questions.json");
  const media = parse(z.array(mediaFileSchema), readJson(file("media.json")), "media.json");
  const bannedWords = readFileSync(file("banned-words.txt"), "utf8");
  const mapPath = file(event.map.file);
  if (!existsSync(mapPath)) throw new ContentError(`Plan introuvable : ${mapPath}`, []);
  const mapSvg = readFileSync(mapPath, "utf8");

  const problems = checkConsistency({ event, stations, questions, media });
  if (problems.length) throw new ContentError("Incohérences dans le contenu", problems);

  const version = createHash("sha256")
    .update(JSON.stringify({ event, stations, questions, media, bannedWords, mapSvg }))
    .digest("hex")
    .slice(0, 16);

  return { dir, version, event, stations, questions, media, bannedWords, mapSvg };
}

export function checkConsistency(b: Pick<ContentBundle, "event" | "stations" | "questions" | "media">): string[] {
  const problems: string[] = [];
  const dup = (label: string, values: (string | undefined)[]) => {
    const seen = new Set<string>();
    for (const v of values) {
      if (v === undefined) continue;
      if (seen.has(v)) problems.push(`${label} en double : ${v}`);
      seen.add(v);
    }
  };
  dup("stations.code", b.stations.map((s) => s.code));
  dup("stations.position", b.stations.map((s) => String(s.position)));
  dup("stations.qr_token", b.stations.map((s) => s.qr_token));
  dup("stations.short_code", b.stations.map((s) => s.short_code));
  dup("questions.key", b.questions.map((q) => q.key));
  dup("media.ref", b.media.map((m) => m.ref));

  const stationCodes = new Set(b.stations.map((s) => s.code));
  const required = b.stations.filter((s) => s.counts_in_progress).length;
  if (required !== b.event.required_stations) {
    problems.push(`event.required_stations = ${b.event.required_stations} mais ${required} stations comptent dans la progression`);
  }
  for (const code of ["A", "Z"]) {
    const s = b.stations.find((x) => x.code === code);
    if (s?.counts_in_progress) problems.push(`La station ${code} ne doit pas compter dans la progression`);
  }

  const byKey = new Map(b.questions.map((q) => [q.key, q]));
  for (const q of b.questions) {
    if (q.station && !stationCodes.has(q.station)) problems.push(`question ${q.key} : station ${q.station} inconnue`);
    if (q.paired_with) {
      const p = byKey.get(q.paired_with);
      if (!p) problems.push(`question ${q.key} : paired_with ${q.paired_with} inconnue`);
      else {
        if (p.phase !== "avant") problems.push(`question ${q.key} : paired_with doit viser une question avant`);
        if (p.type !== q.type) problems.push(`question ${q.key} : type différent de sa question pairée`);
        if (q.choices === "same_as_paired" && !Array.isArray(p.choices)) {
          problems.push(`question ${q.key} : la question pairée n'a pas de choix à copier`);
        }
      }
    }
    if (Array.isArray(q.choices)) dup(`choices de ${q.key}`, q.choices.map((c) => c.key));
    for (const lang of b.event.languages) {
      if (lang !== "fr" && !q.text[lang]) problems.push(`question ${q.key} : traduction ${lang} manquante`);
    }
  }
  for (const s of b.stations) {
    for (const lang of b.event.languages) {
      if (lang !== "fr" && !s.title[lang]) problems.push(`station ${s.code} : traduction ${lang} du titre manquante`);
    }
  }
  for (const m of b.media) {
    if (!stationCodes.has(m.station)) problems.push(`media ${m.ref} : station ${m.station} inconnue`);
    if (m.consent_status === "granted" && m.type === "video") {
      for (const lang of b.event.languages) {
        if (!m.captions?.[lang]) problems.push(`media ${m.ref} : sous-titres ${lang} manquants pour un média publié`);
      }
    }
  }
  return problems;
}

/** Avertissements non bloquants (traductions à relire, médias en attente, jetons manquants). */
export function contentWarnings(b: ContentBundle): string[] {
  const w: string[] = [];
  for (const s of b.stations) {
    if (!s.qr_token || !s.short_code) w.push(`station ${s.code} : jeton QR ou code court manquant (pnpm qr:tokens)`);
    if (s.x_pct === undefined || s.y_pct === undefined) w.push(`station ${s.code} : position sur le plan manquante`);
  }
  const pending = b.media.filter((m) => m.consent_status !== "granted");
  if (pending.length) w.push(`${pending.length} média(s) non publié(s) faute de consentement validé`);
  for (const m of b.media) {
    for (const [lang, c] of Object.entries(m.captions ?? {})) {
      if (c.status === "auto") w.push(`media ${m.ref} : sous-titres ${lang} non relus`);
    }
  }
  return w;
}

export function contentDir(slug: string, root = process.cwd()): string {
  return path.join(root, "content", slug);
}
