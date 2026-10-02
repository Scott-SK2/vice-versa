/**
 * Démarrage du serveur (appelé par instrumentation.ts) : migrations, premier compte admin,
 * chargement du contenu s'il a changé, tâche de rétention quotidienne.
 * Une seule instance applicative : pas de verrou distribué nécessaire.
 */
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { getDb, schema } from "@/db/client";
import { bootstrapAdminIfEmpty } from "@/lib/admin/auth";
import { contentDir, loadContent } from "@/lib/content/load";
import { reloadContent } from "@/lib/content/reload";
import { env } from "@/lib/env";
import { runMaintenance } from "@/lib/runs/maintenance";

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: "info", at: new Date().toISOString(), msg, ...extra }));
const warn = (msg: string, e: unknown) =>
  console.error(JSON.stringify({ level: "warn", at: new Date().toISOString(), msg, err: e instanceof Error ? e.message : String(e) }));

const flag = (name: string, def: boolean) => {
  const v = process.env[name];
  return v === undefined ? def : v !== "false" && v !== "0";
};

export async function startup(): Promise<void> {
  if (process.env.VERCEL) {
    // Fonctions sans état : migrations et contenu sont appliqués au build (scripts/predeploy.ts),
    // la maintenance passe par /api/cron/maintenance (Vercel Cron). Rien à faire au démarrage.
    return;
  }
  const db = getDb();

  if (flag("RUN_MIGRATIONS_ON_START", true)) {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    log("migrations appliquées");
  }

  try {
    await bootstrapAdminIfEmpty();
  } catch (e) {
    warn("création du premier admin impossible", e);
  }

  if (flag("SEED_CONTENT_ON_START", true)) {
    try {
      const bundle = loadContent(contentDir(env.eventSlug));
      const [event] = await db.select({ v: schema.events.contentVersion }).from(schema.events).where(eq(schema.events.slug, env.eventSlug)).limit(1);
      if (!event || event.v !== bundle.version) {
        const r = await reloadContent(db, bundle, env.mediaBaseUrl);
        log("contenu chargé", { version: r.version, stations: r.stations, questions: r.questions, media: r.media });
      }
    } catch (e) {
      warn("chargement du contenu au démarrage refusé (voir /admin/content)", e);
    }
  }

  const maintenance = async () => {
    try {
      const r = await runMaintenance(db);
      if (r.archivedRuns || r.expiredAdminSessions || r.prunedAuditRows) log("maintenance", r as unknown as Record<string, unknown>);
    } catch (e) {
      warn("maintenance échouée", e);
    }
  };
  setTimeout(maintenance, 60_000).unref();
  setInterval(maintenance, 24 * 60 * 60 * 1000).unref();
}
