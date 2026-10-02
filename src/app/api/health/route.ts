import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { json, withApi } from "@/lib/api/http";
import { getLiveRun } from "@/lib/participant/auth";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  let db = false;
  let live: { id: string; phase: string } | null = null;
  try {
    await getDb().execute(sql`select 1`);
    db = true;
    const run = await getLiveRun();
    live = run ? { id: run.id, phase: run.phase } : null;
  } catch {
    db = false;
  }
  return json({ ok: db, db, live_run: live, version: process.env.APP_VERSION ?? "dev" }, { status: db ? 200 : 503 });
});
