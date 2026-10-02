/**
 * Normalisation des mots libres (three_words) : minuscules, sans accents,
 * sans doublons dans une même réponse, filtrés par la liste de mots interdits.
 */
export function normalizeWord(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9'’\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWords(words: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const n = normalizeWord(w);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export class BannedWords {
  private readonly set: Set<string>;

  constructor(words: Iterable<string>) {
    this.set = new Set(Array.from(words, normalizeWord).filter(Boolean));
  }

  static fromText(text: string): BannedWords {
    return new BannedWords(text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")));
  }

  /** Vrai si le texte (déjà normalisé ou non) contient un mot interdit. */
  contains(text: string): boolean {
    const tokens = normalizeWord(text).split(/[ \-]/);
    return tokens.some((t) => this.set.has(t));
  }

  /** Retourne les mots interdits trouvés dans une liste. */
  findIn(words: readonly string[]): string[] {
    return words.filter((w) => this.contains(w));
  }
}
