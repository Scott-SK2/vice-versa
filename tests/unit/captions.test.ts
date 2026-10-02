import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fromVerboseJson, mergeTranslation, transcribe, translateCaptions, translationPrompt } from "@/lib/captions/groq";
import { type CaptionFile, captionFileSchema, checkCaptionFile } from "@/lib/captions/schema";
import { groupWords, splitWordsProportionally } from "@/lib/captions/split";
import { toVtt } from "@/lib/captions/vtt";

const sample: CaptionFile = {
  media: "VV-V10",
  lang: "fr",
  source: "whisper-large-v3",
  status: "reviewed",
  segments: [
    { id: 1, start: 0.42, end: 3.1, text: "Avant de partir, j'avais une image très précise de Kinshasa.", words: [{ w: "Avant", start: 0.42, end: 0.7 }, { w: "de", start: 0.7, end: 0.81 }] },
    { id: 2, start: 3.4, end: 5.0, text: "Et puis j'ai vu la ville." },
  ],
};

describe("sous-titres : format et outils", () => {
  it("valide le format du cahier et détecte les incohérences temporelles", () => {
    expect(captionFileSchema.safeParse(sample).success).toBe(true);
    expect(checkCaptionFile(sample)).toEqual([]);
    const broken: CaptionFile = { ...sample, segments: [{ id: 1, start: 2, end: 1, text: "x", words: [{ w: "x", start: 5, end: 6 }] }, { id: 1, start: 0.5, end: 1, text: "y" }] };
    const problems = checkCaptionFile(broken);
    expect(problems.some((p) => p.includes("fin avant début"))).toBe(true);
    expect(problems.some((p) => p.includes("hors du segment"))).toBe(true);
    expect(problems.some((p) => p.includes("id en double"))).toBe(true);
  });

  it("répartit la durée au prorata des caractères, bornes exactes", () => {
    const words = splitWordsProportionally("Een korte zin.", 10, 12);
    expect(words.map((w) => w.w)).toEqual(["Een", "korte", "zin."]);
    expect(words[0].start).toBe(10);
    expect(words[2].end).toBe(12);
    expect(words[1].end - words[1].start).toBeGreaterThan(words[0].end - words[0].start);
  });

  it("groupe les mots par 3 au plus en coupant sur la ponctuation forte", () => {
    const words = splitWordsProportionally("Partir, pour moi, c'est grandir. Vraiment grandir ici et maintenant", 0, 10);
    const groups = groupWords(words);
    expect(groups.every((g) => g.length <= 4)).toBe(true);
    expect(groups.some((g) => g[g.length - 1].w === "grandir.")).toBe(true);
    expect(groups.flat()).toHaveLength(words.length);
  });

  it("génère un WebVTT lisible", () => {
    const vtt = toVtt(sample);
    expect(vtt.startsWith("WEBVTT\nKind: captions\nLanguage: fr\n\n1\n00:00:00.420 --> 00:00:03.100\n")).toBe(true);
    expect(vtt).toContain("Et puis j'ai vu la ville.");
  });

  it("convertit la réponse verbose_json de Whisper en segments avec leurs mots", () => {
    const v = {
      text: "Bonjour à tous. Merci.",
      duration: 4,
      segments: [{ id: 0, start: 0, end: 2, text: " Bonjour à tous." }, { id: 1, start: 2.2, end: 3.5, text: " Merci." }],
      words: [{ word: "Bonjour", start: 0.1, end: 0.6 }, { word: "à", start: 0.6, end: 0.7 }, { word: "tous.", start: 0.7, end: 1.9 }, { word: "Merci.", start: 2.3, end: 3.4 }],
    };
    const c = fromVerboseJson("VV-V01", "fr", "whisper-large-v3", v);
    expect(c.segments).toHaveLength(2);
    expect(c.segments[0].words?.map((w) => w.w)).toEqual(["Bonjour", "à", "tous."]);
    expect(c.segments[1].words).toHaveLength(1);
    expect(c.status).toBe("auto");
    expect(checkCaptionFile(c)).toEqual([]);
  });

  it("recolle une traduction sur les segments d'origine et refuse un id manquant", () => {
    const nl = mergeTranslation(sample, "nl", [{ id: 1, text: "Voor ik vertrok, had ik een heel precies beeld van Kinshasa." }, { id: 2, text: "En toen zag ik de stad." }], "translation:test");
    expect(nl.lang).toBe("nl");
    expect(nl.segments[0].start).toBe(0.42);
    expect(nl.segments[0].words?.length).toBeGreaterThan(5);
    expect(nl.segments[0].words?.at(-1)?.end).toBe(3.1);
    expect(() => mergeTranslation(sample, "en", [{ id: 1, text: "Only one" }], "x")).toThrow(/segments 2/);
    expect(translationPrompt("fr", "nl")).toContain("néerlandais");
  });
});

describe("sous-titres : appels Groq (serveur simulé)", () => {
  let server: http.Server;
  let base: string;
  const received: { path: string; auth: string | undefined; body: string }[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ path: req.url ?? "", auth: req.headers.authorization, body });
        res.setHeader("content-type", "application/json");
        if (req.url === "/openai/v1/audio/transcriptions") {
          res.end(JSON.stringify({ text: "Salut.", duration: 1.2, segments: [{ id: 0, start: 0, end: 1.2, text: " Salut." }], words: [{ word: "Salut.", start: 0.1, end: 1.0 }] }));
        } else if (req.url === "/openai/v1/chat/completions") {
          const sent = JSON.parse(body);
          const user = JSON.parse(sent.messages[1].content) as { segments: { id: number; text: string }[] };
          const out = { segments: user.segments.map((s) => ({ id: s.id, text: `[${sent.model}] ${s.text.toUpperCase()}` })) };
          res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
        } else {
          res.statusCode = 404;
          res.end("{}");
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/openai/v1`;
  });
  afterAll(() => server.close());

  it("envoie l'audio en multipart avec les bons paramètres et convertit la réponse", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "vv-cap-"));
    const audio = path.join(dir, "VV-V01.flac");
    writeFileSync(audio, Buffer.from("fLaC-fake"));
    const c = await transcribe({ apiKey: "k", apiBase: base }, audio, "fr", "VICE VERSA, Kinshasa");
    expect(c.segments).toHaveLength(1);
    const r = received.find((x) => x.path.endsWith("/audio/transcriptions"))!;
    expect(r.auth).toBe("Bearer k");
    for (const needle of ['name="model"', "whisper-large-v3", "verbose_json", 'name="timestamp_granularities[]"', "VICE VERSA, Kinshasa", "VV-V01.flac"]) {
      expect(r.body).toContain(needle);
    }
  });

  it("traduit en JSON strict, conserve les horodatages et choisit le modèle configuré", async () => {
    const en = await translateCaptions({ apiKey: "k", apiBase: base, translateModel: "modele-test" }, sample, "en");
    expect(en.segments[1].text).toBe("[modele-test] ET PUIS J'AI VU LA VILLE.");
    expect(en.segments[1].start).toBe(3.4);
    expect(en.source).toBe("translation:modele-test");
    const r = received.find((x) => x.path.endsWith("/chat/completions"))!;
    expect(JSON.parse(r.body).response_format).toEqual({ type: "json_object" });
  });

  it("remonte une erreur HTTP lisible", async () => {
    await expect(transcribe({ apiKey: "k", apiBase: base + "/nope" }, "/dev/null", "fr")).rejects.toThrow(/404/);
  });
});
