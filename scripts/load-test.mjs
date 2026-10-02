/**
 * Test de charge (08 § 1) : N participants virtuels pendant D secondes contre un serveur démarré.
 *
 *   pnpm load                                  # 80 VU, 30 min, pilote les phases d'une séance de test
 *   pnpm load --vus 80 --duration 1800 --base http://localhost:3000 --ramp 60
 *   pnpm load --no-drive                       # ne crée ni ne pilote de séance : suppose une séance live
 *
 * Chaque participant : page d'accueil, POST /api/sessions, sondage /api/runs/current toutes les 10 s,
 * 3 questions « Avant », 8 stations (scan, contenu, réponses, agrégat, progression), questions « Après »,
 * bilan, trace. Seuils : p95 ≤ 300 ms par route API (--p95), 0 erreur 5xx ou réseau.
 * Rapport : work/load/report-<horodatage>.json.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const VUS = Number(opt("vus", 80));
const DURATION = Number(opt("duration", 1800));
const RAMP = Number(opt("ramp", Math.min(60, DURATION / 4)));
const BASE = (opt("base", "http://localhost:3000")).replace(/\/$/, "");
const P95_MAX = Number(opt("p95", 300));
const DRIVE = !argv.includes("--no-drive");

const stations = JSON.parse(readFileSync("content/vv26/stations.json", "utf8")).filter((s) => s.counts_in_progress);
const WORDS = ["chaleur", "famille", "musique", "bruit", "soleil", "pluie", "travail", "fleuve", "sourire", "trafic", "école", "énergie"];
const TEXTS = ["Le repas du dimanche en famille", "La musique dans la rue", "Dire bonjour à tout le monde", "Prendre le temps", "Partager ce qu'on a"];
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms * (0.6 + Math.random() * 0.8);

// ---------------------------------------------------------------------------
// Mesures
// ---------------------------------------------------------------------------
const metrics = new Map(); // label → { lat: number[], errors: number, statuses: Map }
const errorsLog = [];
function record(label, ms, status, err) {
  let m = metrics.get(label);
  if (!m) metrics.set(label, (m = { lat: [], errors: 0, statuses: new Map() }));
  m.lat.push(ms);
  m.statuses.set(status, (m.statuses.get(status) ?? 0) + 1);
  if (err) {
    m.errors++;
    if (errorsLog.length < 50) errorsLog.push(`${label} → ${status} ${err}`);
  }
}
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function req(label, method, path, { token, body, etag } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (etag) headers["if-none-match"] = etag;
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    const ms = performance.now() - t0;
    const text = res.status === 304 ? "" : await res.text();
    const data = text && res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : null;
    const serverError = res.status >= 500;
    record(label, ms, res.status, serverError ? (data?.error?.code ?? text.slice(0, 80)) : null);
    return { status: res.status, data, etag: res.headers.get("etag") };
  } catch (e) {
    record(label, performance.now() - t0, 0, e.name === "TimeoutError" ? "timeout" : e.message);
    return { status: 0, data: null, etag: null };
  }
}

// ---------------------------------------------------------------------------
// Pilotage de la séance (phases proportionnelles à la durée)
// ---------------------------------------------------------------------------
let runId = null;
const sh = (c) => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function drivePhases() {
  const created = sh(`pnpm -s seance create --label "Charge ${VUS} VU" --kind test`);
  runId = /([0-9a-f-]{36})/.exec(created)[1];
  sh(`pnpm -s seance start --id ${runId}`);
  // accueil 10 %, parcours 55 %, après 10 %, discussion 15 %, trace 10 %
  const plan = [["parcours", 0.1], ["apres", 0.65], ["discussion", 0.75], ["trace", 0.9]];
  for (const [phase, at] of plan) {
    setTimeout(() => {
      try {
        sh(`pnpm -s seance phase --id ${runId} --to ${phase}`);
        console.log(`  [${elapsed()}] phase → ${phase}`);
      } catch (e) {
        console.log(`  phase ${phase} impossible : ${e.message}`);
      }
    }, at * DURATION * 1000).unref();
  }
}
function stopRun() {
  if (!runId) return;
  try {
    sh(`pnpm -s seance close --id ${runId}`);
    sh(`pnpm -s seance delete --id ${runId}`);
  } catch (e) {
    console.log(`  nettoyage de la séance : ${e.message}`);
  }
}

const start = Date.now();
const elapsed = () => `${Math.floor((Date.now() - start) / 1000)}s`;
const remaining = () => DURATION * 1000 - (Date.now() - start);

// ---------------------------------------------------------------------------
// Un participant virtuel
// ---------------------------------------------------------------------------
function answerFor(q) {
  const ids = q.choices.map((c) => c.id);
  switch (q.type) {
    case "single_choice":
    case "guess_reveal":
      return { choice_id: pick(ids) };
    case "tri_state":
      return Math.random() < 0.3 ? { choice_id: pick(ids), comment: pick(TEXTS) } : { choice_id: pick(ids) };
    case "multi_choice": {
      const n = q.min_choices ?? 1;
      return { choice_ids: [...ids].sort(() => Math.random() - 0.5).slice(0, n) };
    }
    case "three_words":
      return { words: [...WORDS].sort(() => Math.random() - 0.5).slice(0, 3) };
    case "short_text":
      return { text: pick(TEXTS) };
    default:
      return null;
  }
}

async function answerPhase(token, phase) {
  const r = await req(`GET /api/questions?phase=${phase}`, "GET", `/api/questions?phase=${phase}`, { token });
  if (!r.data?.questions || r.data.locked) return;
  for (const q of r.data.questions) {
    if (q.answer) continue;
    const value = answerFor(q);
    if (!value) continue;
    await sleep(jitter(Math.min(8000, (DURATION * 1000) / 150)));
    await req(`PUT /api/answers/{key}`, "PUT", `/api/answers/${q.key}`, { token, body: { value, client_ts: new Date().toISOString() } });
  }
}

async function visitStation(token, station) {
  const scan = await req("POST /api/scan", "POST", "/api/scan", { token, body: Math.random() < 0.8 ? { token: station.qr_token } : { short_code: station.short_code } });
  if (scan.status !== 200) return;
  const st = await req("GET /api/stations/{code}", "GET", `/api/stations/${station.code}`, { token });
  if (!st.data) return;
  for (const m of st.data.media ?? []) {
    if (m.captions?.fr) await req("GET captions", "GET", new URL(m.captions.fr.words, BASE).pathname);
  }
  await sleep(jitter(Math.min(45_000, (DURATION * 1000) / 40))); // regarde la vidéo
  for (const q of st.data.questions ?? []) {
    if (q.locked) continue;
    const value = answerFor(q);
    if (!value) continue;
    const a = await req("PUT /api/answers/{key}", "PUT", `/api/answers/${q.key}`, { token, body: { value, client_ts: new Date().toISOString() } });
    if (a.data?.aggregate_available) await req("GET /api/questions/{key}/aggregate", "GET", `/api/questions/${q.key}/aggregate`, { token });
  }
  await req("GET /api/me/progress", "GET", "/api/me/progress", { token });
}

async function participant(index) {
  await sleep((index / VUS) * RAMP * 1000);
  await req("GET /vv26 (html)", "GET", "/vv26");
  const s = await req("POST /api/sessions", "POST", "/api/sessions", { body: { lang: pick(["fr", "fr", "nl", "en"]) } });
  const token = s.data?.token;
  if (!token) return;

  let phase = s.data.run.phase;
  let etag = null;
  let done = { avant: false, apres: false, trace: false, bilan: false };
  const toVisit = [...stations].sort(() => Math.random() - 0.5);
  let busy = false;

  // Sondage toutes les 10 s, indépendant du scénario.
  const poll = setInterval(async () => {
    const r = await req("GET /api/runs/current", "GET", "/api/runs/current", { etag });
    if (r.status === 200 && r.data) {
      etag = r.etag;
      if (r.data.status === "live") phase = r.data.phase;
    }
  }, 10_000);

  const gap = () => Math.max(2000, ((DURATION * 1000) / 2) / (toVisit.length + 2));

  while (remaining() > 2000) {
    if (busy) {
      await sleep(500);
      continue;
    }
    busy = true;
    try {
      if (!done.avant && (phase === "accueil" || phase === "parcours" || phase === "apres")) {
        await answerPhase(token, "avant");
        done.avant = true;
      } else if (phase === "apres" && !done.apres) {
        // Dès l'ouverture des questions finales, on y répond avant de finir d'éventuelles stations.
        await answerPhase(token, "apres");
        done.apres = true;
      } else if ((phase === "parcours" || phase === "apres") && toVisit.length) {
        await visitStation(token, toVisit.shift());
        await sleep(jitter(gap()));
      } else if ((phase === "discussion" || phase === "trace") && !done.bilan) {
        await req("GET /api/me/summary", "GET", "/api/me/summary", { token });
        done.bilan = true;
      } else if (phase === "trace" && !done.trace) {
        await answerPhase(token, "trace");
        done.trace = true;
      } else {
        await sleep(jitter(5000));
      }
    } finally {
      busy = false;
    }
  }
  clearInterval(poll);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`Test de charge : ${VUS} participants, ${DURATION}s, montée ${RAMP}s, cible ${BASE}`);
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) {
    console.error("✘ Serveur injoignable ou base indisponible (GET /api/health)");
    process.exit(2);
  }
  if (DRIVE) drivePhases();
  else if (!health.live_run) {
    console.error("✘ Aucune séance live et --no-drive : lancer une séance d'abord");
    process.exit(2);
  }
  const progress = setInterval(() => {
    const total = [...metrics.values()].reduce((a, m) => a + m.lat.length, 0);
    const errs = [...metrics.values()].reduce((a, m) => a + m.errors, 0);
    console.log(`  [${elapsed()}] ${total} requêtes, ${errs} erreur(s)`);
  }, 30_000);
  await Promise.all(Array.from({ length: VUS }, (_, i) => participant(i)));
  clearInterval(progress);
  stopRun();

  // Rapport
  const rows = [...metrics.entries()]
    .map(([label, m]) => ({ label, count: m.lat.length, errors: m.errors, p50: Math.round(pct(m.lat, 50)), p95: Math.round(pct(m.lat, 95)), p99: Math.round(pct(m.lat, 99)), max: Math.round(Math.max(...m.lat)), statuses: Object.fromEntries(m.statuses) }))
    .sort((a, b) => b.count - a.count);
  const totalReq = rows.reduce((a, r) => a + r.count, 0);
  const totalErr = rows.reduce((a, r) => a + r.errors, 0);
  const apiRows = rows.filter((r) => r.label.includes("/api/"));
  const slow = apiRows.filter((r) => r.p95 > P95_MAX);
  console.log("\nRoute".padEnd(42) + "n".padStart(7) + "err".padStart(6) + "p50".padStart(7) + "p95".padStart(7) + "p99".padStart(7) + "max".padStart(7));
  for (const r of rows) console.log(r.label.padEnd(41) + String(r.count).padStart(7) + String(r.errors).padStart(6) + `${r.p50}`.padStart(7) + `${r.p95}`.padStart(7) + `${r.p99}`.padStart(7) + `${r.max}`.padStart(7));
  console.log(`\n${totalReq} requêtes en ${elapsed()} (${(totalReq / ((Date.now() - start) / 1000)).toFixed(1)} req/s), ${totalErr} erreur(s) 5xx/réseau`);
  if (errorsLog.length) console.log("Premières erreurs :\n  " + errorsLog.slice(0, 10).join("\n  "));
  mkdirSync("work/load", { recursive: true });
  const report = `work/load/report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(report, JSON.stringify({ vus: VUS, duration: DURATION, base: BASE, totalReq, totalErr, rows }, null, 2));
  console.log(`Rapport : ${report}`);
  const ok = totalErr === 0 && slow.length === 0;
  console.log(ok ? `✔ Seuils respectés (p95 ≤ ${P95_MAX} ms, 0 erreur)` : `✘ Seuils dépassés : ${totalErr ? `${totalErr} erreur(s) ; ` : ""}${slow.map((r) => `${r.label} p95=${r.p95} ms`).join(", ")}`);
  process.exit(ok ? 0 : 1);
}

process.on("SIGINT", () => {
  stopRun();
  process.exit(130);
});
main().catch((e) => {
  console.error(e);
  stopRun();
  process.exit(1);
});
