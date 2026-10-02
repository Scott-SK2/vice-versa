/**
 * Garde-fous issus de la revue de sécurité : limites anti-abus et comparaison de clé.
 */
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/db/client";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { getCatalogBySlug, invalidateCatalog } from "@/lib/content/catalog";
import { closeRun, createRun, startRun } from "@/lib/runs/service";
import { POST as login } from "@/app/api/admin/auth/login/route";
import { GET as publicProjection } from "@/app/api/projection/[runId]/current/route";
import { GET as getMe } from "@/app/api/me/route";
import { POST as postScan } from "@/app/api/scan/route";
import { POST as postSessions } from "@/app/api/sessions/route";

type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;
async function call<P extends Record<string, string>>(h: Handler<P>, method: string, path: string, o: { body?: unknown; bearer?: string; ip?: string; params?: P } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": o.ip ?? "10.5.5.5" };
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  const res = await h(new Request(`http://test.local${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) }), { params: Promise.resolve((o.params ?? {}) as P) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const db = getDb();
const created: string[] = [];
let runId: string;
let projectionKey: string;

beforeAll(async () => {
  invalidateCatalog();
  const cat = await getCatalogBySlug("vv26");
  if (!cat) throw new Error("Base non seedée");
  await db.update(schema.runs).set({ status: "closed" }).where(and(eq(schema.runs.eventId, cat.event.id), eq(schema.runs.status, "live")));
  const run = await createRun(db, null, { eventSlug: "vv26", label: "Sécurité", kind: "test" });
  created.push(run.id);
  runId = run.id;
  projectionKey = run.projectionKey;
  await startRun(db, null, run.id);
  resetRateLimits();
});

afterAll(async () => {
  for (const id of created) await closeRun(db, null, id).catch(() => undefined);
  if (created.length) await db.delete(schema.runs).where(inArray(schema.runs.id, created));
  delete process.env.MAX_SESSIONS_PER_RUN;
  await closeDb();
});

describe("garde-fous", () => {
  it("bloque les codes de station devinés par session puis par IP", async () => {
    const s = await call(postSessions, "POST", "/api/sessions", { body: {}, ip: "10.6.6.6" });
    const token = s.body.token as string;
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await call(postScan, "POST", "/api/scan", { bearer: token, body: { short_code: "ZZZZ" }, ip: "10.6.6.6" })).status;
    expect(last).toBe(429);
    resetRateLimits();
  });

  it("bloque les jetons inventés depuis une même IP", async () => {
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await call(getMe, "GET", "/api/me", { bearer: `v1.${runId}.faux${i}xxxxxxxxxxxxxxxxxxxxxx`, ip: "10.7.7.7" })).status;
    expect(last).toBe(429);
    resetRateLimits();
  });

  it("refuse une mauvaise clé de projection, puis bloque l'IP après 10 essais, sans toucher l'écran légitime", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await call(publicProjection, "GET", `/api/projection/${runId}/current?key=mauvaise${i}`, { params: { runId }, ip: "10.8.8.8" });
      expect(r.status).toBe(403);
    }
    const blocked = await call(publicProjection, "GET", `/api/projection/${runId}/current?key=${projectionKey}`, { params: { runId }, ip: "10.8.8.8" });
    expect(blocked.status).toBe(429);
    const legit = await call(publicProjection, "GET", `/api/projection/${runId}/current?key=${projectionKey}`, { params: { runId }, ip: "10.9.9.9" });
    expect(legit.status).toBe(200);
    resetRateLimits();
  });

  it("limite les tentatives de connexion par e-mail toutes IP confondues", async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await call(login, "POST", "/api/admin/auth/login", { body: { email: "cible@vv.local", password: "mauvais-mot-de-passe-1" }, ip: `10.10.${Math.floor(i / 4)}.${i % 4}` })).status;
    }
    expect(last).toBe(429);
    resetRateLimits();
  });

  it("plafonne le nombre de sessions par séance", async () => {
    process.env.MAX_SESSIONS_PER_RUN = "3";
    const run = await createRun(db, null, { eventSlug: "vv26", label: "Plafond", kind: "test" });
    created.push(run.id);
    await closeRun(db, null, runId);
    await startRun(db, null, run.id);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await call(postSessions, "POST", "/api/sessions", { body: {}, ip: `10.11.0.${i}` })).status);
    expect(statuses).toEqual([201, 201, 201, 429]);
    delete process.env.MAX_SESSIONS_PER_RUN;
  });
});

describe("tâche de maintenance externe", () => {
  it("exige CRON_SECRET et renvoie un rapport", async () => {
    const { GET: cron } = await import("@/app/api/cron/maintenance/route");
    process.env.CRON_SECRET = "secret-cron-de-test";
    const call2 = (auth?: string) =>
      cron(new Request("http://test.local/api/cron/maintenance", { headers: auth ? { authorization: auth } : {} }), { params: Promise.resolve({}) });
    expect((await call2()).status).toBe(403);
    expect((await call2("Bearer mauvais")).status).toBe(403);
    const ok = await call2("Bearer secret-cron-de-test");
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.ok).toBe(true);
    expect(typeof body.archivedRuns).toBe("number");
    expect(typeof body.sweptLimits).toBe("number");
    delete process.env.CRON_SECRET;
  });
});
