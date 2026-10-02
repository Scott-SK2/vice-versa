/**
 * Pilotage des séances en ligne de commande, en attendant la console admin.
 *
 *   pnpm seance list
 *   pnpm seance create --label "Test interne 1" [--kind test|repetition|live]
 *   pnpm seance start --id <uuid>
 *   pnpm seance phase --id <uuid> --to parcours [--back]
 *   pnpm seance close --id <uuid>
 *   pnpm seance reopen --id <uuid>
 *   pnpm seance reset --id <uuid>
 *   pnpm seance delete --id <uuid>
 */
import { desc, eq } from "drizzle-orm";
import { arg, requireEnv } from "./_env";
import { closeDb, getDb, schema } from "@/db/client";
import type { EventPhase, RunKind } from "@/db/schema/enums";
import { ApiError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { archiveRun, closeRun, createRun, deleteRun, reopenRun, resetRun, setPhase, startRun } from "@/lib/runs/service";
import { runCounters } from "@/lib/runs/summary";

requireEnv("DATABASE_URL");
const cmd = process.argv[2];
const db = getDb();

async function main(): Promise<void> {
  const id = arg("id");
  switch (cmd) {
    case "list": {
      const rows = await db.select().from(schema.runs).orderBy(desc(schema.runs.createdAt));
      for (const r of rows) {
        const c = await runCounters(db, r.id);
        console.log(
          `${r.id}  ${r.status.padEnd(8)} ${r.kind.padEnd(10)} ${r.phase.padEnd(10)} sessions ${String(c.sessions).padStart(3)} (${c.active} actives)  ${r.label}`,
        );
      }
      if (!rows.length) console.log("Aucune séance. Créer : pnpm seance create --label \"Test interne 1\"");
      return;
    }
    case "create": {
      const label = arg("label");
      if (!label) throw new Error("--label requis");
      const run = await createRun(db, null, { eventSlug: env.eventSlug, label, kind: (arg("kind") as RunKind) ?? "test" });
      console.log(`✔ Séance créée ${run.id} (${run.kind}, ${run.status})`);
      return;
    }
    case "start":
      return log(await startRun(db, null, need(id)));
    case "phase": {
      const to = arg("to") as EventPhase | undefined;
      if (!to) throw new Error("--to requis");
      return log(await setPhase(db, null, need(id), to, { confirmBackwards: process.argv.includes("--back") }));
    }
    case "close":
      return log(await closeRun(db, null, need(id)));
    case "reopen":
      return log(await reopenRun(db, null, need(id)));
    case "reset":
      return log(await resetRun(db, null, need(id)));
    case "archive":
      return log(await archiveRun(db, null, need(id)));
    case "delete":
      await deleteRun(db, null, need(id));
      console.log("✔ Séance supprimée");
      return;
    case "show": {
      const [r] = await db.select().from(schema.runs).where(eq(schema.runs.id, need(id)));
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    default:
      console.log("Commandes : list | create | start | phase | close | reopen | reset | archive | delete | show");
  }
}

function need(id: string | undefined): string {
  if (!id) throw new Error("--id requis");
  return id;
}

function log(run: typeof schema.runs.$inferSelect) {
  console.log(`✔ ${run.label} : ${run.status} / ${run.phase}`);
}

main()
  .catch((e) => {
    console.error(`✘ ${e instanceof ApiError ? `${e.code} — ${e.message}` : e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
