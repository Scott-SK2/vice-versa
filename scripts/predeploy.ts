/**
 * Étape de build sur un hébergeur géré (Vercel) : applique les migrations et charge le contenu
 * si DATABASE_URL est définie, puis laisse `next build` s'exécuter.
 *   pnpm vercel-build  →  tsx scripts/predeploy.ts && next build
 * Sans DATABASE_URL (aperçu sans base), l'étape est ignorée.
 */
import "./_env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { closeDb, getDb } from "@/db/client";
import { contentDir, loadContent } from "@/lib/content/load";
import { reloadContent } from "@/lib/content/reload";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("predeploy : DATABASE_URL absente, migrations et contenu ignorés");
    return;
  }
  process.env.SESSION_SECRET ??= "predeploy";
  const db = getDb();
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  console.log("predeploy : migrations appliquées");
  const slug = process.env.EVENT_SLUG ?? "vv26";
  const bundle = loadContent(contentDir(slug));
  const r = await reloadContent(db, bundle, process.env.MEDIA_BASE_URL ?? "/media");
  console.log(`predeploy : contenu ${slug} chargé (version ${r.version}, ${r.stations} stations, ${r.questions} questions, ${r.media} médias)`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(`predeploy : ✘ ${e instanceof Error ? e.message : String(e)}`);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
