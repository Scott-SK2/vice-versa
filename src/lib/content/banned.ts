import { readFileSync } from "node:fs";
import path from "node:path";
import { BannedWords } from "@/lib/domain/words";

let cache: { slug: string; words: BannedWords } | null = null;

/** Liste des mots interdits de content/<slug>/banned-words.txt, chargée une fois par processus. */
export function getBannedWords(slug: string): BannedWords {
  if (cache?.slug === slug) return cache.words;
  let text = "";
  try {
    text = readFileSync(path.join(process.cwd(), "content", slug, "banned-words.txt"), "utf8");
  } catch {
    // Pas de liste : aucun filtre.
  }
  cache = { slug, words: BannedWords.fromText(text) };
  return cache.words;
}
