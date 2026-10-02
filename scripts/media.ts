/**
 * pnpm media <commande> [options] — préparation et vérification des médias (07 § 5 et § 7).
 *
 *   encode <ref> --in <source> [--out public/media] [--poster-at 3]
 *       ffmpeg selon le cahier : 720×1280 portrait, H.264 1,2 Mbit/s, AAC 96 kbit/s, loudnorm −16 LUFS,
 *       faststart ; nom de fichier et poster tirés de media.json ; durée réécrite dans media.json.
 *   sample [--ref VV-V12] [--out public/media] [--seconds 12]
 *       clip de test synthétique (mire + bip) encodé par la même chaîne, avec sous-titres FR/NL/EN
 *       d'exemple : pour tester le lecteur sur de vrais téléphones avant l'arrivée des clips.
 *   grant <ref>
 *       passe consent_status à granted si consents.csv l'autorise et si les sous-titres existent ;
 *       déclare les langues de sous-titres dans media.json. revoke <ref> fait l'inverse.
 *   sync-captions [--out public/media] [<ref>]
 *       copie les fichiers de sous-titres (json + vtt) de content/<slug>/captions/ vers <out>/captions/,
 *       le dossier servi sous MEDIA_BASE_URL (à faire avant rsync vers le serveur ou le CDN).
 *   list [--dir public/media]
 *       tableau des fichiers attendus pour chaque média (vidéo ou image, poster, sous-titres ×3)
 *       avec présent / manquant : la liste de ce qu'il reste à déposer.
 *   check [--dir public/media] [--all]
 *       vérifie chaque média publié (granted, ou tous avec --all) : fichier, poster, sous-titres,
 *       codec/dimensions/durée (local, via ffprobe) ou en-têtes HTTP (MEDIA_BASE_URL absolu).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { arg } from "./_env";
import { type CaptionFile } from "@/lib/captions/schema";
import { splitWordsProportionally } from "@/lib/captions/split";
import { toVtt } from "@/lib/captions/vtt";
import { ContentError, contentDir, loadContent } from "@/lib/content/load";
import type { MediaFile } from "@/lib/content/schema";

const slug = arg("slug") ?? "vv26";
const dir = contentDir(slug);
const mediaJson = path.join(dir, "media.json");
const capDir = path.join(dir, "captions");
const cmd = process.argv[2];
const refArg = process.argv[3]?.startsWith("--") ? undefined : process.argv[3];

type MediaEntry = MediaFile & Record<string, unknown>;
const readMedia = (): MediaEntry[] => JSON.parse(readFileSync(mediaJson, "utf8"));
const writeMedia = (list: MediaEntry[]) => writeFileSync(mediaJson, JSON.stringify(list, null, 2) + "\n");
const findMedia = (list: MediaEntry[], ref: string) => {
  const m = list.find((x) => x.ref === ref);
  if (!m) throw new Error(`${ref} absent de media.json`);
  return m;
};

function run(bin: string, args: string[], quiet = false): string {
  const r = spawnSync(bin, args, { encoding: "utf8", stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"] });
  if (r.status !== 0) throw new Error(`${bin} a échoué (${r.status})${quiet ? ` : ${r.stderr?.slice(-300)}` : ""}`);
  return r.stdout;
}

function probe(file: string) {
  const out = run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], true);
  const j = JSON.parse(out) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number }[]; format: { duration: string } };
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  return { duration: Number(j.format.duration), vcodec: v?.codec_name, width: v?.width, height: v?.height, acodec: a?.codec_name };
}

/** Encodage conforme au cahier (« Préparation technique » 2 et 3). */
function encodeFile(input: string, output: string, poster: string | null, posterAt: number | null) {
  mkdirSync(path.dirname(output), { recursive: true });
  run("ffmpeg", [
    "-y", "-i", input,
    "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-level", "4.0", "-b:v", "1200k", "-maxrate", "1500k", "-bufsize", "2400k", "-g", "60",
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
    output,
  ]);
  const info = probe(output);
  if (poster) {
    const at = posterAt ?? Math.min(3, info.duration / 3);
    run("ffmpeg", ["-y", "-ss", String(at), "-i", output, "-frames:v", "1", "-q:v", "3", "-vf", "scale=720:-2", poster]);
  }
  return info;
}

function sampleCaptions(ref: string, seconds: number): CaptionFile[] {
  const lines: Record<CaptionFile["lang"], string[]> = {
    fr: ["Ceci est un clip de test pour VICE VERSA.", "Les sous-titres s’affichent mot après mot.", "Le mot prononcé passe en jaune, comme prévu."],
    nl: ["Dit is een testclip voor VICE VERSA.", "De ondertitels verschijnen woord voor woord.", "Het gesproken woord wordt geel, zoals voorzien."],
    en: ["This is a test clip for VICE VERSA.", "Subtitles appear word by word.", "The spoken word turns yellow, as planned."],
  };
  const per = seconds / 3;
  return (Object.keys(lines) as CaptionFile["lang"][]).map((lang) => ({
    media: ref,
    lang,
    source: "manual",
    status: "reviewed",
    segments: lines[lang].map((text, i) => {
      const start = Math.round((i * per + 0.4) * 100) / 100;
      const end = Math.round(((i + 1) * per - 0.3) * 100) / 100;
      return { id: i + 1, start, end, text, words: splitWordsProportionally(text, start, end) };
    }),
  }));
}

function writeCaptions(files: CaptionFile[]) {
  mkdirSync(capDir, { recursive: true });
  for (const c of files) {
    writeFileSync(path.join(capDir, `${c.media}.${c.lang}.json`), JSON.stringify(c, null, 2) + "\n");
    writeFileSync(path.join(capDir, `${c.media}.${c.lang}.vtt`), toVtt(c));
  }
}

/** Copie les sous-titres vers le dossier servi (public/media/captions ou deploy/data/media/captions). */
function syncCaptions(outDir: string, onlyRef?: string): number {
  const target = path.join(outDir, "captions");
  mkdirSync(target, { recursive: true });
  let n = 0;
  if (!existsSync(capDir)) return 0;
  for (const f of readdirSync(capDir)) {
    if (!/^VV-V\d{2}\.(fr|nl|en)\.(json|vtt)$/.test(f)) continue;
    if (onlyRef && !f.startsWith(`${onlyRef}.`)) continue;
    copyFileSync(path.join(capDir, f), path.join(target, f));
    n++;
  }
  return n;
}

type ConsentRow = Record<string, string>;
function readConsents(): ConsentRow[] {
  const file = path.join(dir, "consents.csv");
  if (!existsSync(file)) return [];
  const [header, ...rows] = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  const cols = header.split(",").map((c) => c.trim());
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v.trim()])));
}

async function main() {
  switch (cmd) {
    case "encode": {
      const ref = refArg ?? "";
      const input = arg("in");
      if (!/^VV-V\d{2}$/.test(ref) || !input || !existsSync(input)) throw new Error("Usage : pnpm media encode VV-V10 --in source.mp4 [--out public/media]");
      const list = readMedia();
      const m = findMedia(list, ref);
      const outDir = path.resolve(arg("out") ?? "public/media");
      const out = path.join(outDir, m.file);
      const poster = m.poster ? path.join(outDir, m.poster) : null;
      console.log(`Encodage de ${ref} → ${path.relative(process.cwd(), out)}…`);
      const info = encodeFile(input, out, poster, arg("poster-at") ? Number(arg("poster-at")) : null);
      m.duration_s = Math.round(info.duration * 10) / 10;
      writeMedia(list);
      console.log(`✔ ${info.width}×${info.height} ${info.vcodec}/${info.acodec}, ${m.duration_s} s${poster ? `, poster ${path.basename(poster)}` : ""} ; durée mise à jour dans media.json`);
      return;
    }
    case "sample": {
      const ref = arg("ref") ?? "VV-V12";
      const seconds = Number(arg("seconds") ?? 12);
      const list = readMedia();
      const m = findMedia(list, ref);
      const outDir = path.resolve(arg("out") ?? "public/media");
      mkdirSync(outDir, { recursive: true });
      const raw = path.join(outDir, `.${ref}-raw.mp4`);
      console.log(`Clip de test ${ref} (${seconds} s) : mire portrait + bip…`);
      run("ffmpeg", [
        "-y", "-f", "lavfi", "-i", `testsrc2=size=720x1280:rate=30:duration=${seconds}`,
        "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
        "-vf", `drawtext=text='VICE VERSA — test ${ref}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=h*0.4:box=1:boxcolor=black@0.5`,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", raw,
      ], true);
      const out = path.join(outDir, m.file);
      const poster = m.poster ? path.join(outDir, m.poster) : null;
      const info = encodeFile(raw, out, poster, 2);
      run("rm", ["-f", raw], true);
      m.duration_s = Math.round(info.duration * 10) / 10;
      writeMedia(list);
      writeCaptions(sampleCaptions(ref, info.duration));
      syncCaptions(outDir, ref);
      console.log(`✔ ${path.relative(process.cwd(), out)} (${info.width}×${info.height}, ${Math.round(info.duration)} s), poster, sous-titres fr/nl/en d'exemple dans content/${slug}/captions/ et ${path.relative(process.cwd(), outDir)}/captions/`);
      console.log(`  Puis : pnpm media grant ${ref} (consents.csv doit contenir une ligne de test) et pnpm db:seed, ou « Recharger le contenu » dans la console.`);
      return;
    }
    case "grant":
    case "revoke": {
      const ref = refArg ?? "";
      if (!/^VV-[PV]\d{2}$/.test(ref)) throw new Error(`Usage : pnpm media ${cmd} VV-V10`);
      const list = readMedia();
      const m = findMedia(list, ref);
      if (cmd === "revoke") {
        m.consent_status = "refused";
        writeMedia(list);
        console.log(`✔ ${ref} : consent_status = refused (retiré de l'application au prochain rechargement)`);
        return;
      }
      const row = readConsents().find((r) => r.media_ref === ref);
      const problems: string[] = [];
      if (!row) problems.push(`aucune ligne ${ref} dans consents.csv`);
      else {
        if (!["ecrit", "message"].includes(row.consentement)) problems.push(`consentement = « ${row.consentement} » (attendu : ecrit ou message)`);
        if (row.autorisation_diffusion !== "oui") problems.push("autorisation_diffusion ≠ oui");
        if (row.mineur === "oui" && row.accord_parent !== "oui") problems.push("mineur sans accord_parent = oui");
      }
      const bundle = loadContent(dir);
      const captions: Record<string, { status: "auto" | "reviewed" }> = {};
      if (m.type === "video") {
        for (const lang of bundle.event.languages) {
          const f = path.join(capDir, `${ref}.${lang}.json`);
          if (!existsSync(f) || !existsSync(path.join(capDir, `${ref}.${lang}.vtt`))) problems.push(`sous-titres ${lang} manquants (captions/${ref}.${lang}.json + .vtt)`);
          else captions[lang] = { status: (JSON.parse(readFileSync(f, "utf8")) as CaptionFile).status };
        }
      }
      if (problems.length) {
        console.error(`✘ ${ref} ne peut pas être publié :`);
        for (const p of problems) console.error(`  - ${p}`);
        process.exit(1);
      }
      m.consent_status = "granted";
      if (m.type === "video") m.captions = captions;
      writeMedia(list);
      const auto = Object.entries(captions).filter(([, c]) => c.status === "auto").map(([l]) => l);
      console.log(`✔ ${ref} : consent_status = granted${m.type === "video" ? `, sous-titres ${Object.keys(captions).join("/")}` : ""}`);
      if (auto.length) console.log(`  ⚠ sous-titres non relus : ${auto.join(", ")}`);
      console.log("  Puis pnpm db:seed, ou « Recharger le contenu » dans la console.");
      return;
    }
    case "list": {
      const bundle = loadContent(dir);
      const localDir = path.resolve(arg("dir") ?? "public/media");
      const has = (rel: string) => existsSync(path.join(localDir, rel));
      let missing = 0;
      console.log(`Fichiers attendus dans ${path.relative(process.cwd(), localDir)}/ (noms de media.json) :\n`);
      for (const m of bundle.media) {
        const items: [string, boolean][] = [[m.file, has(m.file)]];
        if (m.poster) items.push([m.poster, has(m.poster)]);
        if (m.type === "video") for (const lang of bundle.event.languages) for (const ext of ["json", "vtt"]) items.push([`captions/${m.ref}.${lang}.${ext}`, has(`captions/${m.ref}.${lang}.${ext}`)]);
        const miss = items.filter(([, ok]) => !ok).length;
        missing += miss;
        const status = m.consent_status === "granted" ? "publié" : m.consent_status === "refused" ? "refusé" : "en attente de consentement";
        console.log(`${m.ref}  station ${m.station}  ${status}${m.note ? `  — ${m.note}` : ""}`);
        for (const [rel, ok] of items) console.log(`   ${ok ? "✔" : "·"} ${rel}`);
      }
      console.log(`\n${missing} fichier(s) manquant(s). Déposer les fichiers, puis : pnpm media grant <ref> → pnpm media check → git add public/media content && git commit && git push`);
      return;
    }
    case "sync-captions": {
      const outDir = path.resolve(arg("out") ?? "public/media");
      const n = syncCaptions(outDir, refArg);
      console.log(`✔ ${n} fichier(s) de sous-titres copié(s) vers ${path.relative(process.cwd(), outDir)}/captions/`);
      return;
    }
    case "check": {
      let bundle;
      try {
        bundle = loadContent(dir);
      } catch (e) {
        if (e instanceof ContentError) {
          console.error(`✘ ${e.message}`);
          for (const p of e.problems) console.error(`  - ${p}`);
          process.exit(1);
        }
        throw e;
      }
      const all = process.argv.includes("--all");
      const base = (process.env.MEDIA_BASE_URL ?? "/media").replace(/\/$/, "");
      const remote = /^https?:\/\//.test(base);
      const localDir = path.resolve(arg("dir") ?? "public/media");
      const targets = bundle.media.filter((m) => all || m.consent_status === "granted");
      if (!targets.length) {
        console.log("Aucun média publié (consent_status = granted). --all pour tout vérifier.");
        return;
      }
      let problems = 0;
      const checkOne = async (rel: string, kind: string): Promise<string> => {
        if (remote) {
          const url = `${base}/${rel}`;
          try {
            const res = await fetch(url, { method: "GET", headers: { range: "bytes=0-0" } });
            const ct = res.headers.get("content-type") ?? "";
            const ranges = res.status === 206 || res.headers.get("accept-ranges") === "bytes";
            if (!res.ok && res.status !== 206) return `${kind} : HTTP ${res.status}`;
            if (kind === "vidéo" && !ranges) return `${kind} : pas de requêtes de plage (Accept-Ranges) sur le CDN`;
            if (kind === "vidéo" && !ct.startsWith("video/")) return `${kind} : Content-Type ${ct || "absent"}`;
            return "";
          } catch (e) {
            return `${kind} : ${e instanceof Error ? e.message : String(e)}`;
          }
        }
        const file = path.join(localDir, rel);
        if (!existsSync(file)) return `${kind} : ${path.relative(process.cwd(), file)} absent`;
        return "";
      };
      for (const m of targets) {
        const issues: string[] = [];
        const r1 = await checkOne(m.file, m.type === "video" ? "vidéo" : "image");
        if (r1) issues.push(r1);
        if (m.poster) {
          const r2 = await checkOne(m.poster, "poster");
          if (r2) issues.push(r2);
        }
        if (m.type === "video") {
          for (const lang of bundle.event.languages) {
            if (!m.captions?.[lang as "fr"]) issues.push(`sous-titres ${lang} non déclarés`);
            else {
              for (const ext of ["json", "vtt"]) {
                const r = await checkOne(`captions/${m.ref}.${lang}.${ext}`, `sous-titres ${lang}.${ext}`);
                if (r) issues.push(r);
              }
            }
          }
          if (!remote && !r1) {
            const info = probe(path.join(localDir, m.file));
            if (info.vcodec !== "h264") issues.push(`codec vidéo ${info.vcodec} (attendu h264)`);
            if (info.width !== 720 || info.height !== 1280) issues.push(`dimensions ${info.width}×${info.height} (attendu 720×1280)`);
            if (m.duration_s && Math.abs(info.duration - m.duration_s) > 2) issues.push(`durée ${info.duration.toFixed(1)} s ≠ media.json ${m.duration_s} s`);
          }
        }
        problems += issues.length;
        console.log(`  ${issues.length ? "✘" : "✔"} ${m.ref} ${m.file}${issues.length ? "\n      - " + issues.join("\n      - ") : ""}`);
      }
      console.log(problems ? `✘ ${problems} problème(s) sur ${targets.length} média(s)` : `✔ ${targets.length} média(s) vérifié(s) (${remote ? base : path.relative(process.cwd(), localDir)})`);
      if (problems) process.exit(1);
      return;
    }
    default:
      console.log("Commandes : encode | sample | grant | revoke | sync-captions | list | check (voir l'en-tête du script)");
  }
}

main().catch((e) => {
  console.error(`✘ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
