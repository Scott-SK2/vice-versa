import { describe, expect, it } from "vitest";
import { checkConsistency, contentDir, loadContent } from "@/lib/content/load";

describe("contenu vv26", () => {
  const bundle = loadContent(contentDir("vv26"));

  it("se charge et respecte le cahier : 8 stations comptées + A + Z", () => {
    expect(bundle.stations).toHaveLength(10);
    expect(bundle.stations.filter((s) => s.counts_in_progress)).toHaveLength(8);
    expect(bundle.event.required_stations).toBe(8);
  });

  it("a 3 questions Avant pairées avec 3 questions Après", () => {
    const apres = bundle.questions.filter((q) => q.phase === "apres" && q.paired_with);
    expect(apres).toHaveLength(3);
    for (const q of apres) {
      const p = bundle.questions.find((x) => x.key === q.paired_with);
      expect(p?.phase).toBe("avant");
      expect(p?.type).toBe(q.type);
    }
  });

  it("a une question de station pour chacune des 8 stations et une trace", () => {
    for (const code of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
      expect(bundle.questions.some((q) => q.station === code)).toBe(true);
    }
    expect(bundle.questions.find((q) => q.phase === "trace")?.type).toBe("short_text");
  });

  it("référence les 9 photos et 8 vidéos du lot du 10 octobre, chaque station dans l'ordre", () => {
    expect(bundle.media.filter((m) => m.type === "image")).toHaveLength(9);
    expect(bundle.media.filter((m) => m.type === "video")).toHaveLength(8);
    for (const code of ["A", "1", "4"]) {
      const positions = bundle.media.filter((m) => m.station === code).map((m) => m.position);
      expect(positions).toEqual(positions.map((_, i) => i + 1));
    }
  });

  it("détecte une incohérence", () => {
    const broken = structuredClone(bundle);
    broken.questions[0].key = broken.questions[1].key;
    broken.media[0].station = "9";
    const problems = checkConsistency(broken);
    expect(problems.some((p) => p.includes("en double"))).toBe(true);
    expect(problems.some((p) => p.includes("station 9 inconnue"))).toBe(true);
  });
});
