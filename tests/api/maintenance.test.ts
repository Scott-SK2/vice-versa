import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/db/client";
import { runMaintenance } from "@/lib/runs/maintenance";
import { closeRun, createRun, startRun } from "@/lib/runs/service";
import { getCatalogBySlug, invalidateCatalog } from "@/lib/content/catalog";
import { hashToken } from "@/lib/participant/token";

const db = getDb();
let runId: string;

beforeAll(async () => {
  invalidateCatalog();
  const cat = await getCatalogBySlug("vv26");
  if (!cat) throw new Error("Base non seedée");
  await db.update(schema.runs).set({ status: "closed" }).where(eq(schema.runs.status, "live"));
  const run = await createRun(db, null, { eventSlug: "vv26", label: "Rétention test", kind: "test" });
  runId = run.id;
  await startRun(db, null, run.id);
  await db.insert(schema.participantSessions).values({ runId: run.id, tokenHash: hashToken(`t-${Date.now()}`), lang: "fr" });
  await closeRun(db, null, run.id);
});

afterAll(async () => {
  await db.delete(schema.runs).where(eq(schema.runs.id, runId));
  await closeDb();
});

describe("rétention", () => {
  it("n'archive pas une séance récente", async () => {
    const r = await runMaintenance(db);
    expect(r.archivedRuns).toBe(0);
    const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId));
    expect(run.status).toBe("closed");
  });

  it("archive une séance clôturée depuis plus de 12 mois et garde le résumé", async () => {
    const old = new Date();
    old.setMonth(old.getMonth() - 13);
    await db.update(schema.runs).set({ closedAt: old }).where(eq(schema.runs.id, runId));
    const r = await runMaintenance(db);
    expect(r.archivedRuns).toBe(1);
    const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId));
    expect(run.status).toBe("archived");
    expect(run.summary?.sessions).toBe(1);
    const sessions = await db.select().from(schema.participantSessions).where(eq(schema.participantSessions.runId, runId));
    expect(sessions).toHaveLength(0);
  });
});
