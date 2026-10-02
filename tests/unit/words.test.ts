import { describe, expect, it } from "vitest";
import { BannedWords, normalizeWord, normalizeWords } from "@/lib/domain/words";

describe("mots libres", () => {
  it("met en minuscules et retire les accents", () => {
    expect(normalizeWord("  Chaleur ")).toBe("chaleur");
    expect(normalizeWord("Énergie")).toBe("energie");
    expect(normalizeWord("Fête!!")).toBe("fete");
  });

  it("supprime les doublons d'une même réponse", () => {
    expect(normalizeWords(["Famille", "famille", "FAMILLE", "bruit"])).toEqual(["famille", "bruit"]);
  });

  it("détecte les mots interdits malgré casse et accents", () => {
    const banned = BannedWords.fromText("# commentaire\nmerde\nnègre\n");
    expect(banned.contains("MERDE")).toBe(true);
    expect(banned.contains("negre")).toBe(true);
    expect(banned.contains("famille")).toBe(false);
    expect(banned.findIn(["chaleur", "Merde", "bruit"])).toEqual(["Merde"]);
  });
});
