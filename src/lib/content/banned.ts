import { readFileSync } from "node:fs";
import path from "node:path";
import { BannedWords } from "@/lib/domain/words";

let cache: { key: string; words: BannedWords } | null = null;

/**
 * Liste des mots interdits : d'abord celle chargée en base avec le contenu (events.banned_words),
 * sinon le fichier content/<slug>/banned-words.txt s'il est présent sur le disque.
 */
export function getBannedWords(slug: string, fromDb?: readonly string[] | null): BannedWords {
  const key = `${slug}:${fromDb?.length ?? "file"}`;
  if (cache?.key === key) return cache.words;
  let words: BannedWords;
  if (fromDb && fromDb.length) words = new BannedWords(fromDb);
  else {
    let text = "";
    try {
      text = readFileSync(path.join(process.cwd(), "content", slug, "banned-words.txt"), "utf8");
    } catch {
      // Pas de liste : aucun filtre.
    }
    words = BannedWords.fromText(text);
  }
  cache = { key, words };
  return words;
}
