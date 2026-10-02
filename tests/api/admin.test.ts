/**
 * Tests d'intégration de l'API d'administration : authentification, rôles, CSRF,
 * cycle de vie des séances, modération, projection, export, comptes, contenu.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/db/client";
import { hashPassword } from "@/lib/admin/auth";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { getCatalogBySlug, invalidateCatalog } from "@/lib/content/catalog";
import { POST as login } from "@/app/api/admin/auth/login/route";
import { GET as me } from "@/app/api/admin/auth/me/route";
import { POST as logout } from "@/app/api/admin/auth/logout/route";
import { GET as listRuns, POST as createRunRoute } from "@/app/api/admin/runs/route";
import { GET as getRun, DELETE as deleteRunRoute } from "@/app/api/admin/runs/[id]/route";
import { POST as startRoute } from "@/app/api/admin/runs/[id]/start/route";
import { POST as phaseRoute } from "@/app/api/admin/runs/[id]/phase/route";
import { POST as closeRoute } from "@/app/api/admin/runs/[id]/close/route";
import { POST as resetRoute } from "@/app/api/admin/runs/[id]/reset/route";
import { GET as dashboardRoute } from "@/app/api/admin/runs/[id]/dashboard/route";
import { GET as answersRoute } from "@/app/api/admin/runs/[id]/answers/route";
import { POST as moderateRoute } from "@/app/api/admin/answers/[id]/moderate/route";
import { GET as projectionGet, PUT as projectionPut } from "@/app/api/admin/runs/[id]/projection/route";
import { GET as exportCsvRoute } from "@/app/api/admin/runs/[id]/export.csv/route";
import { GET as auditRoute } from "@/app/api/admin/runs/[id]/audit/route";
import { GET as usersGet, POST as usersPost } from "@/app/api/admin/users/route";
import { PATCH as userPatch } from "@/app/api/admin/users/[id]/route";
import { GET as contentStatusRoute } from "@/app/api/admin/content/status/route";
import { GET as publicProjection } from "@/app/api/projection/[runId]/current/route";
import { POST as postSessions } from "@/app/api/sessions/route";
import { POST as postScan } from "@/app/api/scan/route";
import { PUT as putAnswer } from "@/app/api/answers/[key]/route";

type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type Opts<P> = { body?: unknown; cookie?: string; csrf?: boolean; params?: P; bearer?: string; ip?: string };

async function call<P extends Record<string, string>>(handler: Handler<P>, method: string, path: string, o: Opts<P> = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", host: "test.local", "x-forwarded-for": o.ip ?? "10.1.1.1" };
  if (o.cookie) headers.cookie = o.cookie;
  if (o.csrf !== false && method !== "GET") headers["x-requested-with"] = "vv-admin";
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  const req = new Request(`http://test.local${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const res = await handler(req, { params: Promise.resolve((o.params ?? {}) as P) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body: body as Loose, headers: res.headers };
}

const db = getDb();
const PW = "motdepasse-admin-test-123";
const EMAILS = { admin: "admin.test@vv.local", anim: "anim.test@vv.local", mod: "mod.test@vv.local", created: "new.test@vv.local" };
const cookies: Record<string, string> = {};
const createdRuns: string[] = [];
let catalog: NonNullable<Awaited<ReturnType<typeof getCatalogBySlug>>>;
let runId: string;

async function signIn(email: string, password = PW) {
  const r = await call(login, "POST", "/api/admin/auth/login", { body: { email, password } });
  const setCookie = r.headers.get("set-cookie") ?? "";
  return { ...r, cookie: setCookie.split(";")[0] };
}

beforeAll(async () => {
  invalidateCatalog();
  const cat = await getCatalogBySlug("vv26");
  if (!cat) throw new Error("Base non seedée : pnpm db:migrate && pnpm db:seed");
  catalog = cat;
  await db.delete(schema.adminUsers).where(like(schema.adminUsers.email, "%@vv.local"));
  const hash = await hashPassword(PW);
  await db.insert(schema.adminUsers).values([
    { email: EMAILS.admin, displayName: "Admin Test", role: "admin", passwordHash: hash },
    { email: EMAILS.anim, displayName: "Anim Test", role: "animateur", passwordHash: hash },
    { email: EMAILS.mod, displayName: "Mod Test", role: "moderateur", passwordHash: hash },
  ]);
  await db.update(schema.runs).set({ status: "closed" }).where(and(eq(schema.runs.eventId, cat.event.id), eq(schema.runs.status, "live")));
  resetRateLimits();
  for (const [k, email] of Object.entries(EMAILS)) {
    if (k === "created") continue;
    const r = await signIn(email);
    expect(r.status).toBe(200);
    cookies[k] = r.cookie;
  }
});

afterAll(async () => {
  if (createdRuns.length) await db.delete(schema.runs).where(inArray(schema.runs.id, createdRuns));
  await db.delete(schema.adminUsers).where(like(schema.adminUsers.email, "%@vv.local"));
  await closeDb();
});

describe("Authentification admin", () => {
  it("refuse un mauvais mot de passe, accepte le bon, renvoie /me", async () => {
    const bad = await call(login, "POST", "/api/admin/auth/login", { body: { email: EMAILS.admin, password: "faux-mot-de-passe-1" } });
    expect(bad.status).toBe(401);
    const r = await call(me, "GET", "/api/admin/auth/me", { cookie: cookies.admin });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ email: EMAILS.admin, role: "admin" });
    expect(r.body.user.passwordHash).toBeUndefined();
  });

  it("exige le cookie et l'en-tête CSRF sur les mutations", async () => {
    expect((await call(listRuns, "GET", "/api/admin/runs")).status).toBe(401);
    const noCsrf = await call(createRunRoute, "POST", "/api/admin/runs", { cookie: cookies.admin, csrf: false, body: { label: "x" } });
    expect(noCsrf.status).toBe(403);
  });

  it("bloque les tentatives répétées", async () => {
    resetRateLimits();
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await call(login, "POST", "/api/admin/auth/login", { body: { email: "inconnu@vv.local", password: "xxxxxxxxxxxx" }, ip: "10.2.2.2" })).status;
    }
    expect(last).toBe(429);
    resetRateLimits();
  });

  it("la déconnexion invalide le cookie", async () => {
    const s = await signIn(EMAILS.mod);
    expect((await call(me, "GET", "/api/admin/auth/me", { cookie: s.cookie })).status).toBe(200);
    await call(logout, "POST", "/api/admin/auth/logout", { cookie: s.cookie });
    expect((await call(me, "GET", "/api/admin/auth/me", { cookie: s.cookie })).status).toBe(401);
  });
});

describe("Séances via l'API admin", () => {
  it("seul un admin crée et lance ; une seule séance live", async () => {
    const forbidden = await call(createRunRoute, "POST", "/api/admin/runs", { cookie: cookies.anim, body: { label: "Interdit" } });
    expect(forbidden.status).toBe(403);
    const created = await call(createRunRoute, "POST", "/api/admin/runs", { cookie: cookies.admin, body: { label: "Séance admin test", kind: "test" } });
    expect(created.status).toBe(201);
    runId = created.body.run.id;
    createdRuns.push(runId);
    expect(created.body.run).toMatchObject({ status: "draft", created_by: "Admin Test", sessions: 0 });

    const started = await call(startRoute, "POST", `/api/admin/runs/${runId}/start`, { cookie: cookies.admin, params: { id: runId } });
    expect(started.body.run).toMatchObject({ status: "live", phase: "accueil", started_by: "Admin Test" });

    const other = await call(createRunRoute, "POST", "/api/admin/runs", { cookie: cookies.admin, body: { label: "Deuxième" } });
    createdRuns.push(other.body.run.id);
    const clash = await call(startRoute, "POST", `/api/admin/runs/${other.body.run.id}/start`, { cookie: cookies.admin, params: { id: other.body.run.id } });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("ANOTHER_RUN_LIVE");
    expect(clash.body.error.details.label).toBe("Séance admin test");
  });

  it("l'animateur change de phase, le modérateur non", async () => {
    const mod = await call(phaseRoute, "POST", `/api/admin/runs/${runId}/phase`, { cookie: cookies.mod, params: { id: runId }, body: { phase: "parcours" } });
    expect(mod.status).toBe(403);
    const anim = await call(phaseRoute, "POST", `/api/admin/runs/${runId}/phase`, { cookie: cookies.anim, params: { id: runId }, body: { phase: "parcours" } });
    expect(anim.status).toBe(200);
    expect(anim.body.run.phase).toBe("parcours");
    const back = await call(phaseRoute, "POST", `/api/admin/runs/${runId}/phase`, { cookie: cookies.anim, params: { id: runId }, body: { phase: "accueil" } });
    expect(back.status).toBe(409);
    const backOk = await call(phaseRoute, "POST", `/api/admin/runs/${runId}/phase`, { cookie: cookies.anim, params: { id: runId }, body: { phase: "accueil", confirm_backwards: true } });
    expect(backOk.body.run.phase).toBe("accueil");
    await call(phaseRoute, "POST", `/api/admin/runs/${runId}/phase`, { cookie: cookies.anim, params: { id: runId }, body: { phase: "parcours" } });
  });

  it("tableau de bord, modération et projection suivent l'activité des participants", async () => {
    const s = await call(postSessions, "POST", "/api/sessions", { body: { lang: "fr" } });
    const token = s.body.token as string;
    const st6 = catalog.stationByCode.get("6")!;
    await call(postScan, "POST", "/api/scan", { bearer: token, body: { token: st6.qrToken } });
    const ans = await call(putAnswer, "PUT", "/api/answers/s6_tradition", { bearer: token, params: { key: "s6_tradition" }, body: { value: { text: "Le repas du dimanche" } } });
    expect(ans.status).toBe(200);
    const q = catalog.questionByKey.get("avant_futur")!;
    const europe = catalog.choicesByQuestion.get(q.id)!.find((c) => c.key === "europe")!.id;
    await call(putAnswer, "PUT", "/api/answers/avant_futur", { bearer: token, params: { key: "avant_futur" }, body: { value: { choice_id: europe } } });

    const dash = await call(dashboardRoute, "GET", `/api/admin/runs/${runId}/dashboard`, { cookie: cookies.mod, params: { id: runId } });
    expect(dash.status).toBe(200);
    expect(dash.body.sessions.total).toBe(1);
    expect(dash.body.pending_texts).toBe(1);
    expect(dash.body.stations.find((x: { code: string }) => x.code === "6")).toMatchObject({ opened: 1, completed: 1 });

    const pending = await call(answersRoute, "GET", `/api/admin/runs/${runId}/answers?status=pending`, { cookie: cookies.mod, params: { id: runId } });
    expect(pending.body.items).toHaveLength(1);
    expect(pending.body.items[0]).toMatchObject({ source: "Station 6", text: "Le repas du dimanche" });
    const answerId = pending.body.items[0].id as number;
    const approved = await call(moderateRoute, "POST", `/api/admin/answers/${answerId}/moderate`, { cookie: cookies.mod, params: { id: String(answerId) }, body: { decision: "approved" } });
    expect(approved.body.status).toBe("approved");

    const slides = await call(projectionGet, "GET", `/api/admin/runs/${runId}/projection`, { cookie: cookies.anim, params: { id: runId } });
    expect(slides.body.slides.some((x: { slide: { kind: string; questionKey?: string } }) => x.slide.kind === "approved_texts" && x.slide.questionKey === "s6_tradition")).toBe(true);
    const set = await call(projectionPut, "PUT", `/api/admin/runs/${runId}/projection`, { cookie: cookies.anim, params: { id: runId }, body: { kind: "approved_texts", questionKey: "s6_tradition" } });
    expect(set.status).toBe(200);

    const run = await call(getRun, "GET", `/api/admin/runs/${runId}`, { cookie: cookies.admin, params: { id: runId } });
    const key = run.body.run.projection_key as string;
    const bad = await call(publicProjection, "GET", `/api/projection/${runId}/current?key=mauvaise`, { params: { runId } });
    expect(bad.status).toBe(403);
    const pub = await call(publicProjection, "GET", `/api/projection/${runId}/current?key=${key}`, { params: { runId } });
    expect(pub.status).toBe(200);
    expect(pub.body.slide).toEqual({ kind: "approved_texts", questionKey: "s6_tradition" });
    expect(pub.body.data.texts).toEqual(["Le repas du dimanche"]);

    const csv = await call(exportCsvRoute, "GET", `/api/admin/runs/${runId}/export.csv`, { cookie: cookies.admin, params: { id: runId } });
    expect(csv.status).toBe(200);
    expect(String(csv.body)).toContain("s6_tradition");
    expect(String(csv.body)).not.toContain(s.body.session_id);
    expect((await call(exportCsvRoute, "GET", `/api/admin/runs/${runId}/export.csv`, { cookie: cookies.anim, params: { id: runId } })).status).toBe(403);
  });

  it("stopper, journal, réinitialisation d'une séance de test, suppression", async () => {
    const closed = await call(closeRoute, "POST", `/api/admin/runs/${runId}/close`, { cookie: cookies.admin, params: { id: runId } });
    expect(closed.body.run).toMatchObject({ status: "closed", closed_by: "Admin Test", has_summary: true });
    const audit = await call(auditRoute, "GET", `/api/admin/runs/${runId}/audit`, { cookie: cookies.admin, params: { id: runId } });
    const actions = audit.body.entries.map((e: { action: string }) => e.action);
    for (const a of ["run.create", "run.start", "run.phase", "answer.moderate", "slide.set", "export", "run.close"]) expect(actions).toContain(a);
    expect(audit.body.entries.find((e: { action: string }) => e.action === "run.close").actor).toBe("Admin Test");

    const reset = await call(resetRoute, "POST", `/api/admin/runs/${runId}/reset`, { cookie: cookies.admin, params: { id: runId } });
    expect(reset.body.run).toMatchObject({ sessions: 0, phase: "accueil", status: "closed" });
    const del = await call(deleteRunRoute, "DELETE", `/api/admin/runs/${runId}`, { cookie: cookies.admin, params: { id: runId } });
    expect(del.status).toBe(200);
    const list = await call(listRuns, "GET", "/api/admin/runs", { cookie: cookies.mod });
    expect(list.body.runs.some((r: { id: string }) => r.id === runId)).toBe(false);
  });
});

describe("Comptes et contenu", () => {
  it("crée un compte avec mot de passe temporaire et protège le dernier admin", async () => {
    const created = await call(usersPost, "POST", "/api/admin/users", {
      cookie: cookies.admin,
      body: { email: EMAILS.created, display_name: "Nouveau", role: "moderateur", temporary_password: "temporaire-123456" },
    });
    expect(created.status).toBe(201);
    expect(created.body.user.mustChangePassword).toBe(true);
    const s = await signIn(EMAILS.created, "temporaire-123456");
    expect(s.status).toBe(200);
    const blocked = await call(listRuns, "GET", "/api/admin/runs", { cookie: s.cookie });
    expect(blocked.status).toBe(403);

    const list = await call(usersGet, "GET", "/api/admin/users", { cookie: cookies.admin });
    const adminRow = list.body.users.find((u: { email: string }) => u.email === EMAILS.admin);
    const self = await call(userPatch, "PATCH", `/api/admin/users/${adminRow.id}`, { cookie: cookies.admin, params: { id: adminRow.id }, body: { active: false } });
    expect(self.status).toBe(403);
    expect((await call(usersGet, "GET", "/api/admin/users", { cookie: cookies.anim })).status).toBe(403);
  });

  it("expose l'état du contenu", async () => {
    const r = await call(contentStatusRoute, "GET", "/api/admin/content/status", { cookie: cookies.admin });
    expect(r.status).toBe(200);
    expect(r.body.folder.stations).toBe(10);
    expect(typeof r.body.up_to_date).toBe("boolean");
  });
});
