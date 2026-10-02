/**
 * pnpm db:seed [--slug vv26]
 * Charge content/<slug>/ en base de façon idempotente (voir src/lib/content/reload.ts).
 */
import { arg, requireEnv } from "./_env";
import { closeDb, getDb } from "@/db/client";
import { ContentError, contentDir, contentWarnings, loadContent } from "@/lib/content/load";
import { ContentReloadError, reloadContent } from "@/lib/content/reload";

requireEnv("DATABASE_URL");
const slug = arg("slug") ?? "vv26";

async function main(): Promise<void> {
  let bundle: ReturnType<typeof loadContent>;
  try {
    bundle = loadContent(contentDir(slug));
  } catch (e) {
    if (e instanceof ContentError) {
      console.error(`✘ ${e.message}`);
      for (const p of e.problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    throw e;
  }
  const r = await reloadContent(getDb(), bundle, process.env.MEDIA_BASE_URL ?? "/media");
  console.log(`✔ content/${slug} chargé (version ${r.version}) : ${r.stations} stations, ${r.questions} questions, ${r.media} médias`);
  for (const w of contentWarnings(bundle)) console.log(`  ⚠ ${w}`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(`✘ ${e instanceof ContentReloadError || e instanceof Error ? e.message : String(e)}`);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
