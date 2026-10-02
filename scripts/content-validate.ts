/**
 * pnpm content:validate [--slug vv26]
 * Valide content/<slug>/ sans toucher à la base.
 */
import { arg } from "./_env";
import { ContentError, contentDir, contentWarnings, loadContent } from "@/lib/content/load";

const slug = arg("slug") ?? "vv26";
try {
  const bundle = loadContent(contentDir(slug));
  console.log(`✔ content/${slug} valide (version ${bundle.version})`);
  console.log(`  ${bundle.stations.length} stations, ${bundle.questions.length} questions, ${bundle.media.length} médias`);
  for (const w of contentWarnings(bundle)) console.log(`  ⚠ ${w}`);
} catch (e) {
  if (e instanceof ContentError) {
    console.error(`✘ ${e.message}`);
    for (const p of e.problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  throw e;
}
