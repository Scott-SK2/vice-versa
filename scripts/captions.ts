/**
 * pnpm captions <commande> [options]
 *
 *   extract <ref> --in <video>      ffmpeg → work/captions/<ref>.flac (16 kHz mono)
 *   transcribe <ref> [--lang fr] [--force]
 *                                   Groq Whisper → content/vv26/captions/<ref>.fr.json (+ .vtt), status auto
 *   translate <ref> --to nl,en [--force]
 *                                   traduit le fichier FR relu, segment par segment → <ref>.<lang>.json (+ .vtt)
 *   emit <ref>|all                  régénère les .vtt depuis les .json (après relecture)
 *   check                           valide tous les fichiers et croise avec media.json
 *
 * Variables : GROQ_API_KEY (obligatoire pour transcribe/translate), GROQ_API_BASE,
 * TRANSCRIBE_MODEL (whisper-large-v3), TRANSLATE_MODEL (llama-3.3-70b-versatile).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { arg } from "./_env";
import { fromVerboseJson, type GroqOptions, transcribe, translateCaptions } from "@/lib/captions/groq";
import { type CaptionFile, captionFileSchema, checkCaptionFile } from "@/lib/captions/schema";
import { toVtt } from "@/lib/captions/vtt";
import { contentDir, loadContent } from "@/lib/content/load";

const slug = arg("slug") ?? "vv26";
const capDir = path.join(contentDir(slug), "captions");
const workDir = path.resolve("work/captions");
const cmd = process.argv[2];
const ref = process.argv[3];
const force = process.argv.includes("--force");

const jsonPath = (r: string, lang: string) => path.join(capDir, `${r}.${lang}.json`);
const vttPath = (r: string, lang: string) => path.join(capDir, `${r}.${lang}.vtt`);

function readCaption(file: string): CaptionFile {
  const parsed = captionFileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`${path.relative(process.cwd(), file)} invalide : ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" ; ")}`);
  return parsed.data;
}

function writeCaption(c: CaptionFile) {
  mkdirSync(capDir, { recursive: true });
  writeFileSync(jsonPath(c.media, c.lang), JSON.stringify(c, null, 2) + "\n");
  writeFileSync(vttPath(c.media, c.lang), toVtt(c));
  console.log(`  ✔ ${path.relative(process.cwd(), jsonPath(c.media, c.lang))} (${c.segments.length} segments, ${c.status})`);
}

function groqOptions(): GroqOptions {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY manquante (scripts de sous-titrage seulement, jamais sur le serveur)");
  return { apiKey, apiBase: process.env.GROQ_API_BASE, transcribeModel: process.env.TRANSCRIBE_MODEL, translateModel: process.env.TRANSLATE_MODEL };
}

function needRef(): string {
  if (!ref || !/^VV-V\d{2}$/.test(ref)) throw new Error("Référence attendue : VV-V01 … VV-V24");
  return ref;
}

async function main() {
  switch (cmd) {
    case "extract": {
      const r = needRef();
      const input = arg("in");
      if (!input || !existsSync(input)) throw new Error("--in <fichier vidéo> requis");
      mkdirSync(workDir, { recursive: true });
      const out = path.join(workDir, `${r}.flac`);
      const res = spawnSync("ffmpeg", ["-y", "-i", input, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "flac", out], { stdio: "inherit" });
      if (res.status !== 0) throw new Error("ffmpeg a échoué (est-il installé ?)");
      console.log(`✔ ${path.relative(process.cwd(), out)}`);
      return;
    }
    case "transcribe": {
      const r = needRef();
      const lang = (arg("lang") ?? "fr") as CaptionFile["lang"];
      const audio = path.join(workDir, `${r}.flac`);
      if (!existsSync(audio)) throw new Error(`${audio} introuvable : lancer d'abord pnpm captions extract ${r} --in <video>`);
      const target = jsonPath(r, lang);
      if (existsSync(target) && !force) {
        const existing = readCaption(target);
        if (existing.status === "reviewed") throw new Error(`${target} est déjà relu ; --force pour écraser (la relecture sera perdue).`);
      }
      const prompt = existsSync(path.join(capDir, "prompt.txt")) ? readFileSync(path.join(capDir, "prompt.txt"), "utf8").trim() : undefined;
      const opts = groqOptions();
      console.log(`Transcription de ${r} (${lang}) avec ${opts.transcribeModel ?? "whisper-large-v3"}…`);
      const raw = await transcribe(opts, audio, lang, prompt);
      mkdirSync(workDir, { recursive: true });
      writeFileSync(path.join(workDir, `${r}.${lang}.raw.json`), JSON.stringify(raw, null, 2));
      const caption = fromVerboseJson(r, lang, opts.transcribeModel ?? "whisper-large-v3", raw);
      writeCaption(caption);
      console.log("  → Relecture humaine obligatoire, puis \"status\": \"reviewed\" dans le fichier.");
      return;
    }
    case "translate": {
      const r = needRef();
      const langs = (arg("to") ?? "nl,en").split(",").map((l) => l.trim()) as CaptionFile["lang"][];
      const source = readCaption(jsonPath(r, "fr"));
      if (source.status !== "reviewed") console.log("  ⚠ Le fichier FR n'est pas marqué relu : la traduction héritera de ses erreurs.");
      const opts = groqOptions();
      for (const to of langs) {
        if (to === "fr") continue;
        const target = jsonPath(r, to);
        if (existsSync(target) && !force && readCaption(target).status === "reviewed") {
          console.log(`  · ${to} déjà relu, ignoré (--force pour écraser)`);
          continue;
        }
        console.log(`Traduction de ${r} vers ${to} avec ${opts.translateModel ?? "llama-3.3-70b-versatile"}…`);
        writeCaption(await translateCaptions(opts, source, to));
      }
      return;
    }
    case "emit": {
      const files = readdirSync(capDir).filter((f) => f.endsWith(".json") && (ref === "all" || !ref || f.startsWith(`${ref}.`)));
      if (!files.length) throw new Error("Aucun fichier de sous-titres trouvé");
      for (const f of files) {
        const c = readCaption(path.join(capDir, f));
        writeFileSync(vttPath(c.media, c.lang), toVtt(c));
        console.log(`  ✔ ${c.media}.${c.lang}.vtt`);
      }
      return;
    }
    case "check": {
      const bundle = loadContent(contentDir(slug));
      const files = existsSync(capDir) ? readdirSync(capDir).filter((f) => /^VV-V\d{2}\.(fr|nl|en)\.json$/.test(f)) : [];
      let problems = 0;
      const byMedia = new Map<string, Map<string, CaptionFile>>();
      for (const f of files) {
        try {
          const c = readCaption(path.join(capDir, f));
          const issues = checkCaptionFile(c);
          if (!existsSync(vttPath(c.media, c.lang))) issues.push("fichier .vtt manquant (pnpm captions emit)");
          const [m, l] = f.split(".");
          if (c.media !== m || c.lang !== l) issues.push(`nom de fichier incohérent avec media/lang (${c.media}/${c.lang})`);
          for (const i of issues) console.log(`  ✘ ${f} : ${i}`);
          problems += issues.length;
          if (!byMedia.has(c.media)) byMedia.set(c.media, new Map());
          byMedia.get(c.media)!.set(c.lang, c);
        } catch (e) {
          console.log(`  ✘ ${e instanceof Error ? e.message : String(e)}`);
          problems++;
        }
      }
      for (const m of bundle.media.filter((x) => x.type === "video")) {
        const have = byMedia.get(m.ref);
        const langs = bundle.event.languages.map((l) => {
          const c = have?.get(l);
          const declared = m.captions?.[l as "fr"];
          if (c && !declared) {
            console.log(`  ⚠ ${m.ref} : ${l} présent dans captions/ mais non déclaré dans media.json`);
          }
          if (declared && !c) {
            console.log(`  ✘ ${m.ref} : ${l} déclaré dans media.json mais fichier absent`);
            problems++;
          }
          if (declared && c && declared.status !== c.status) {
            console.log(`  ⚠ ${m.ref} : statut ${l} = ${c.status} dans le fichier, ${declared.status} dans media.json`);
          }
          return c ? `${l}:${c.status === "reviewed" ? "✔" : "auto"}` : `${l}:—`;
        });
        console.log(`  ${m.ref}  ${langs.join("  ")}  ${m.consent_status === "granted" ? "publié" : m.consent_status}`);
      }
      console.log(problems ? `✘ ${problems} problème(s)` : "✔ Sous-titres cohérents");
      if (problems) process.exit(1);
      return;
    }
    default:
      console.log("Commandes : extract | transcribe | translate | emit | check (voir l'en-tête du script)");
  }
}

main().catch((e) => {
  console.error(`✘ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
