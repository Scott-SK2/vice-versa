import type { Segment, Word } from "./schema";

/**
 * Pour les langues traduites (pas d'horodatage par mot), répartit la durée du segment
 * entre les mots au prorata du nombre de caractères (cahier, « Rendu façon TikTok »).
 */
export function splitWordsProportionally(text: string, start: number, end: number): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const duration = Math.max(0, end - start);
  const weights = tokens.map((t) => t.replace(/[^\p{L}\p{N}]/gu, "").length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = start;
  return tokens.map((w, i) => {
    const d = (weights[i] / total) * duration;
    const word = { w, start: round(cursor), end: round(i === tokens.length - 1 ? end : cursor + d) };
    cursor += d;
    return word;
  });
}

/** Regroupe les mots d'un segment par 2 à 4 (3 par défaut), en respectant la ponctuation forte. */
export function groupWords(words: Word[], max = 3): Word[][] {
  const groups: Word[][] = [];
  let current: Word[] = [];
  for (const w of words) {
    current.push(w);
    const strong = /[.!?…;:]$/.test(w.w);
    if (current.length >= max || strong) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) {
    // évite un dernier groupe d'un seul mot si on peut le rattacher
    if (current.length === 1 && groups.length && groups[groups.length - 1].length < 4) groups[groups.length - 1].push(current[0]);
    else groups.push(current);
  }
  return groups;
}

export function withProportionalWords(segment: Segment): Segment {
  return { ...segment, words: splitWordsProportionally(segment.text, segment.start, segment.end) };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
