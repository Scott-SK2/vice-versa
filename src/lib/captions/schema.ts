/**
 * Format des sous-titres (cahier v3, « Format des sous-titres ») : segments horodatés
 * avec, pour chaque segment, des mots horodatés (affichage façon TikTok).
 */
import { z } from "zod";

export const wordSchema = z.object({ w: z.string().min(1), start: z.number().min(0), end: z.number().min(0) });
export const segmentSchema = z.object({
  id: z.number().int().positive(),
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().min(1),
  words: z.array(wordSchema).optional(),
});
export const captionFileSchema = z
  .object({
    media: z.string().regex(/^VV-V\d{2}$/),
    lang: z.enum(["fr", "nl", "en"]),
    source: z.string().min(1),
    status: z.enum(["auto", "reviewed"]),
    segments: z.array(segmentSchema).min(1),
  })
  .strict();

export type Word = z.infer<typeof wordSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type CaptionFile = z.infer<typeof captionFileSchema>;

/** Vérifie la cohérence temporelle : ids uniques, start ≤ end, segments croissants, mots dans leur segment. */
export function checkCaptionFile(file: CaptionFile): string[] {
  const problems: string[] = [];
  const ids = new Set<number>();
  let prevEnd = 0;
  for (const s of file.segments) {
    if (ids.has(s.id)) problems.push(`segment ${s.id} : id en double`);
    ids.add(s.id);
    if (s.end < s.start) problems.push(`segment ${s.id} : fin avant début`);
    if (s.start < prevEnd - 0.05) problems.push(`segment ${s.id} : chevauche le précédent`);
    prevEnd = s.end;
    for (const w of s.words ?? []) {
      if (w.start < s.start - 0.05 || w.end > s.end + 0.05) problems.push(`segment ${s.id} : mot « ${w.w} » hors du segment`);
      if (w.end < w.start) problems.push(`segment ${s.id} : mot « ${w.w} » fin avant début`);
    }
  }
  return problems;
}
