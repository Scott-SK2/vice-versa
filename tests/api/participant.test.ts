/**
 * Tests d'intégration de l'API participant contre la base DATABASE_URL (migrée et seedée).
 * Les Route Handlers sont appelés directement, sans serveur HTTP.
 */
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/db/client";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { getCatalogBySlug, invalidateCatalog } from "@/lib/content/catalog";
import { closeRun, createRun, setPhase, startRun } from "@/lib/runs/service";
import { PUT as putAnswer } from "@/app/api/answers/[key]/route";
import { GET as getMe } from "@/app/api/me/route";
import { GET as getProgress } from "@/app/api/me/progress/route";
import { GET as getSummary } from "@/app/api/me/summary/route";
import { GET as getAggregate } from "@/app/api/questions/[key]/aggregate/route";
import { GET as getQuestions } from "@/app/api/questions/route";
import { GET as runsCurrent } from "@/app/api/runs/current/route";
import { POST as postScan } from "@/app/api/scan/route";
import { POST as postSessions } from "@/app/api/sessions/route";
import { GET as getStation } from "@/app/api/stations/[code]/route";
import { POST as postMediaProgress } from "@/app/api/stations/[code]/media-progress/route";
import { POST as postStationScan } from "@/app/api/stations/[code]/scan/route";

type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;

async function call<P extends Record<string, string>>(
  handler: Handler<P>,
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; params?: P; ip?: string } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": opts.ip ?? "10.0.0.1" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const req = new Request(`http://test.local${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await handler(req, { params: Promise.resolve((opts.params ?? {}) as P) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

const db = getDb();
const createdRuns: string[] = [];
let runId: string;
let catalog: NonNullable<Awaited<ReturnType<typeof getCatalogBySlug>>>;
const choiceId = (qKey: string, cKey: string) => {
  const q = catalog.questionByKey.get(qKey)!;
  return catalog.choicesByQuestion.get(q.id)!.find((c) => c.key === cKey)!.id;
};

beforeAll(async () => {
  invalidateCatalog();
  const cat = await getCatalogBySlug("vv26");
  if (!cat) throw new Error("Base non seedée : lancer pnpm db:migrate && pnpm db:seed");
  catalog = cat;
  // Aucune séance live résiduelle pendant les tests.
  await db.update(schema.runs).set({ status: "closed" }).where(and(eq(schema.runs.eventId, cat.event.id), eq(schema.runs.status, "live")));
  const run = await createRun(db, null, { eventSlug: "vv26", label: "Test API", kind: "test" });
  createdRuns.push(run.id);
  runId = run.id;
  await startRun(db, null, run.id);
  resetRateLimits();
});

afterAll(async () => {
  if (createdRuns.length) await db.delete(schema.runs).where(inArray(schema.runs.id, createdRuns));
  await closeDb();
});

describe("API participant", () => {
  let token: string;

  it("GET /api/runs/current renvoie la séance live et un ETag", async () => {
    const r = await call(runsCurrent, "GET", "/api/runs/current");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "live", run_id: runId, phase: "accueil", kind: "test" });
    const etag = r.headers.get("etag")!;
    const req = new Request("http://test.local/api/runs/current", { headers: { "if-none-match": etag } });
    const res = await runsCurrent(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(304);
  });

  it("POST /api/sessions crée une session et GET /api/me conduit aux questions Avant", async () => {
    const r = await call(postSessions, "POST", "/api/sessions", { body: { lang: "nl" } });
    expect(r.status).toBe(201);
    expect(r.body.token).toMatch(new RegExp(`^v1\\.${runId}\\.`));
    expect(r.body.lang).toBe("nl");
    token = r.body.token;
    const me = await call(getMe, "GET", "/api/me", { token });
    expect(me.status).toBe(200);
    expect(me.body.suggested_route).toBe("/vv26/avant");
    expect(me.body.progress).toEqual({ completed: 0, required: 8, percent: 0 });
  });

  it("refuse un jeton inconnu et une station jamais scannée", async () => {
    expect((await call(getMe, "GET", "/api/me", { token: "v1.x.y" })).status).toBe(401);
    const r = await call(getStation, "GET", "/api/stations/3", { token, params: { code: "3" } });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("STATION_LOCKED");
  });

  it("enregistre une réponse Avant, filtre les mots interdits", async () => {
    const q = await call(getQuestions, "GET", "/api/questions?phase=avant", { token });
    expect(q.body.questions.map((x: { key: string }) => x.key)).toEqual(["avant_futur", "avant_mots_europe", "avant_mots_afrique"]);
    expect(q.body.questions[0].text).toMatch(/toekomst/);
    const ok = await call(putAnswer, "PUT", "/api/answers/avant_futur", {
      token,
      params: { key: "avant_futur" },
      body: { value: { choice_id: choiceId("avant_futur", "europe") } },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.saved).toBe(true);
    const bad = await call(putAnswer, "PUT", "/api/answers/avant_mots_europe", {
      token,
      params: { key: "avant_mots_europe" },
      body: { value: { words: ["pluie", "Merde", "froid"] } },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("BANNED_WORD");
    const words = await call(putAnswer, "PUT", "/api/answers/avant_mots_europe", {
      token,
      params: { key: "avant_mots_europe" },
      body: { value: { words: ["Pluie", "pluie", "Froid"] } },
    });
    expect(words.status).toBe(200);
  });

  it("scanne une station en accueil mais n'accepte pas encore sa réponse", async () => {
    const s3 = catalog.stationByCode.get("3")!;
    const scan = await call(postScan, "POST", "/api/scan", { token, body: { token: s3.qrToken.toLowerCase() } });
    expect(scan.status).toBe(200);
    expect(scan.body.station).toMatchObject({ code: "3", state: "in_progress", is_here: true, first_open: true });
    expect(scan.body.needs_before_questions).toBe(true);
    const r = await call(putAnswer, "PUT", "/api/answers/s3_motivation", {
      token,
      params: { key: "s3_motivation" },
      body: { value: { choice_id: choiceId("s3_motivation", "projet") } },
    });
    expect(r.status).toBe(423);
    expect(r.body.error.code).toBe("PHASE_LOCKED");
  });

  it("rejette un code inconnu et un jeton qui ne correspond pas à l'URL", async () => {
    expect((await call(postScan, "POST", "/api/scan", { token, body: { short_code: "ZZZZ" } })).body.error.code).toBe("UNKNOWN_CODE");
    const s3 = catalog.stationByCode.get("3")!;
    const r = await call(postStationScan, "POST", "/api/stations/1/scan", { token, params: { code: "1" }, body: { token: s3.qrToken } });
    expect(r.status).toBe(404);
  });

  it("en parcours : réponse de station → station terminée, progression 1/8", async () => {
    await setPhase(db, null, runId, "parcours");
    const st = await call(getStation, "GET", "/api/stations/3", { token, params: { code: "3" } });
    expect(st.status).toBe(200);
    expect(st.body.questions[0]).toMatchObject({ key: "s3_motivation", locked: false, answer: null });
    const r = await call(putAnswer, "PUT", "/api/answers/s3_motivation", {
      token,
      params: { key: "s3_motivation" },
      body: { value: { choice_id: choiceId("s3_motivation", "projet") }, client_ts: new Date().toISOString() },
    });
    expect(r.status).toBe(200);
    expect(r.body.station).toEqual({ code: "3", state: "completed" });
    expect(r.body.progress).toEqual({ completed: 1, required: 8, percent: 13 });
    const agg = await call(getAggregate, "GET", "/api/questions/s3_motivation/aggregate", { token, params: { key: "s3_motivation" } });
    expect(agg.body).toMatchObject({ masked: true, total: 1 });
  });

  it("ignore un renvoi hors-ligne plus ancien que la réponse enregistrée", async () => {
    const stale = new Date(Date.now() - 60_000).toISOString();
    const r = await call(putAnswer, "PUT", "/api/answers/s3_motivation", {
      token,
      params: { key: "s3_motivation" },
      body: { value: { choice_id: choiceId("s3_motivation", "origines") }, client_ts: stale },
    });
    expect(r.body.saved).toBe(false);
    const st = await call(getStation, "GET", "/api/stations/3", { token, params: { code: "3" } });
    expect(st.body.questions[0].answer).toEqual({ choice_id: choiceId("s3_motivation", "projet") });
  });

  it("scan par code court, guess_reveal avec révélation, station A hors progression", async () => {
    const s1 = catalog.stationByCode.get("1")!;
    const scan = await call(postScan, "POST", "/api/scan", { token, body: { short_code: ` ${s1.shortCode.toLowerCase()} ` } });
    expect(scan.status).toBe(200);
    const r = await call(putAnswer, "PUT", "/api/answers/s1_qui_parle", {
      token,
      params: { key: "s1_qui_parle" },
      body: { value: { choice_id: choiceId("s1_qui_parle", "belgique") } },
    });
    expect(r.body.reveal).toEqual({ correct: false, correct_choice_key: "kinshasa" });
    expect(r.body.progress.completed).toBe(2);
    const a = catalog.stationByCode.get("A")!;
    const scanA = await call(postScan, "POST", "/api/scan", { token, body: { token: a.qrToken } });
    // L'accueil porte un média publié (clip de test) : terminé à 80 % de lecture ; il ne compte jamais dans la progression.
    expect(scanA.body.station.state).toBe("in_progress");
    expect(scanA.body.progress.completed).toBe(2);
    const mp = await call(postMediaProgress, "POST", "/api/stations/A/media-progress", { token, params: { code: "A" }, body: { media_ref: "VV-V12", progress: 0.85 } });
    expect(mp.body.station.state).toBe("completed");
    expect(mp.body.progress.completed).toBe(2);
    const p = await call(getProgress, "GET", "/api/me/progress", { token });
    expect(p.body.last_station).toBe("A");
    expect(p.body.stations.find((s: { code: string }) => s.code === "3").state).toBe("completed");
    expect(p.body.stations.find((s: { code: string }) => s.code === "2").state).toBe("locked");
  });

  it("refuse un saut de phase et verrouille les stations en discussion", async () => {
    await expect(setPhase(db, null, runId, "discussion")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await setPhase(db, null, runId, "apres");
    const me = await call(getMe, "GET", "/api/me", { token });
    expect(me.body.suggested_route).toBe("/vv26/apres");
    const after = await call(putAnswer, "PUT", "/api/answers/apres_futur", {
      token,
      params: { key: "apres_futur" },
      body: { value: { choice_id: choiceId("apres_futur", "afrique") } },
    });
    expect(after.status).toBe(200);
    await setPhase(db, null, runId, "discussion");
    const locked = await call(putAnswer, "PUT", "/api/answers/s3_motivation", {
      token,
      params: { key: "s3_motivation" },
      body: { value: { choice_id: choiceId("s3_motivation", "projet") } },
    });
    expect(locked.status).toBe(423);
    const st2 = await call(getStation, "GET", "/api/stations/2", { token, params: { code: "2" } });
    expect(st2.status).toBe(200);
    expect(st2.body.station.state).toBe("locked");
    const sum = await call(getSummary, "GET", "/api/me/summary", { token });
    const pair = sum.body.pairs.find((p: { key: string }) => p.key === "apres_futur");
    expect(pair.before.choice).toBe("In Europa");
    expect(pair.after.choice).toBe("In Afrika");
  });

  it("après clôture : RUN_CLOSED puis RUN_CHANGED quand une nouvelle séance démarre", async () => {
    await closeRun(db, null, runId);
    const closed = await call(getMe, "GET", "/api/me", { token });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe("RUN_CLOSED");
    expect((await call(postSessions, "POST", "/api/sessions", { body: {} })).body.error.code).toBe("NO_RUN_LIVE");
    const [{ summary }] = await db.select({ summary: schema.runs.summary }).from(schema.runs).where(eq(schema.runs.id, runId));
    expect(summary?.sessions).toBe(1);
    expect(summary?.stations["3"]).toEqual({ opened: 1, completed: 1 });

    const next = await createRun(db, null, { eventSlug: "vv26", label: "Test API 2", kind: "test" });
    createdRuns.push(next.id);
    await startRun(db, null, next.id);
    const changed = await call(getMe, "GET", "/api/me", { token });
    expect(changed.status).toBe(409);
    expect(changed.body).toMatchObject({ error: { code: "RUN_CHANGED", details: { run_id: next.id } } });
    const fresh = await call(postSessions, "POST", "/api/sessions", { body: { lang: "fr" } });
    expect(fresh.status).toBe(201);
    expect(fresh.body.run.id).toBe(next.id);
    await closeRun(db, null, next.id);
  });

  it("limite la création de sessions par IP", async () => {
    const run = await createRun(db, null, { eventSlug: "vv26", label: "Test API 3", kind: "test" });
    createdRuns.push(run.id);
    await startRun(db, null, run.id);
    resetRateLimits();
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await call(postSessions, "POST", "/api/sessions", { body: {}, ip: "10.9.9.9" })).status;
    expect(last).toBe(429);
    await closeRun(db, null, run.id);
  });
});
