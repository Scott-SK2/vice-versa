/**
 * Appels à l'API Groq (compatible OpenAI) pour la transcription Whisper et la traduction
 * par modèle de langage. Utilisé uniquement par scripts/captions.ts, avant l'événement.
 * Le jour J, l'application n'appelle aucune IA.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { CaptionFile, Segment } from "./schema";
import { withProportionalWords } from "./split";

export type GroqOptions = {
  apiKey: string;
  apiBase?: string;
  transcribeModel?: string;
  translateModel?: string;
  fetchImpl?: typeof fetch;
};

const defaults = { apiBase: "https://api.groq.com/openai/v1", transcribeModel: "whisper-large-v3", translateModel: "llama-3.3-70b-versatile" };

const verboseJsonSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  duration: z.number().optional(),
  segments: z.array(z.object({ id: z.number(), start: z.number(), end: z.number(), text: z.string() })).default([]),
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).default([]),
});
export type VerboseJson = z.infer<typeof verboseJsonSchema>;

async function call(opts: GroqOptions, pathname: string, init: RequestInit): Promise<unknown> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`${(opts.apiBase ?? defaults.apiBase).replace(/\/$/, "")}${pathname}`, {
    ...init,
    headers: { authorization: `Bearer ${opts.apiKey}`, ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Groq ${pathname} → ${res.status} : ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Transcription d'un fichier audio (FLAC 16 kHz mono) avec horodatage par mot et par segment. */
export async function transcribe(opts: GroqOptions, audioPath: string, lang: string, prompt?: string): Promise<VerboseJson> {
  const form = new FormData();
  form.append("file", new Blob([await readFile(audioPath)]), path.basename(audioPath));
  form.append("model", opts.transcribeModel ?? defaults.transcribeModel);
  form.append("language", lang);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  form.append("temperature", "0");
  if (prompt) form.append("prompt", prompt.slice(0, 800));
  const raw = await call(opts, "/audio/transcriptions", { method: "POST", body: form });
  return verboseJsonSchema.parse(raw);
}

/** Convertit la réponse Whisper en fichier de sous-titres : mots rattachés à leur segment. */
export function fromVerboseJson(media: string, lang: CaptionFile["lang"], model: string, v: VerboseJson): CaptionFile {
  const words = [...v.words].sort((a, b) => a.start - b.start);
  const segments: Segment[] = v.segments
    .filter((s) => s.text.trim())
    .map((s, i) => {
      const inSeg = words.filter((w) => w.start >= s.start - 0.05 && w.start < s.end + 0.05);
      const seg: Segment = { id: i + 1, start: round(s.start), end: round(s.end), text: s.text.trim() };
      if (inSeg.length) seg.words = inSeg.map((w) => ({ w: w.word.trim(), start: round(w.start), end: round(w.end) }));
      return seg;
    });
  return { media, lang, source: model, status: "auto", segments: segments.length ? segments : [{ id: 1, start: 0, end: round(v.duration ?? 1), text: v.text.trim() || "…" }] };
}

const LANG_NAME: Record<string, string> = { fr: "français", nl: "néerlandais (Belgique)", en: "anglais" };

export function translationPrompt(from: string, to: string): string {
  return [
    `Tu traduis des sous-titres de témoignages de jeunes, du ${LANG_NAME[from] ?? from} vers le ${LANG_NAME[to] ?? to}.`,
    "Règles : phrases courtes, registre oral et naturel, tutoiement conservé, aucune idée ajoutée ni retirée, noms propres inchangés (VICE VERSA, Kinshasa, Gombe, Mix'Up).",
    "Chaque segment est traduit séparément et garde exactement le même id ; ne fusionne ni ne découpe les segments.",
    'Réponds uniquement avec un objet JSON de la forme {"segments":[{"id":1,"text":"..."}]} contenant tous les ids reçus.',
  ].join("\n");
}

const translationSchema = z.object({ segments: z.array(z.object({ id: z.number().int(), text: z.string() })) });

/** Traduit les segments relus ; les horodatages sont conservés, les mots répartis au prorata des caractères. */
export async function translateCaptions(opts: GroqOptions, source: CaptionFile, to: CaptionFile["lang"]): Promise<CaptionFile> {
  const payload = { segments: source.segments.map((s) => ({ id: s.id, text: s.text })) };
  const raw = await call(opts, "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: opts.translateModel ?? defaults.translateModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: translationPrompt(source.lang, to) },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });
  const content = (raw as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content;
  if (!content) throw new Error("Réponse de traduction vide");
  const parsed = translationSchema.parse(JSON.parse(content));
  return mergeTranslation(source, to, parsed.segments, `translation:${opts.translateModel ?? defaults.translateModel}`);
}

/** Recolle les textes traduits sur les segments d'origine ; refuse si un id manque. */
export function mergeTranslation(source: CaptionFile, to: CaptionFile["lang"], translated: { id: number; text: string }[], sourceLabel: string): CaptionFile {
  const byId = new Map(translated.map((t) => [t.id, t.text.trim()]));
  const missing = source.segments.filter((s) => !byId.get(s.id)).map((s) => s.id);
  if (missing.length) throw new Error(`Traduction incomplète : segments ${missing.join(", ")} manquants ou vides`);
  return {
    media: source.media,
    lang: to,
    source: sourceLabel,
    status: "auto",
    segments: source.segments.map((s) => withProportionalWords({ id: s.id, start: s.start, end: s.end, text: byId.get(s.id)! })),
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
