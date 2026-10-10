/**
 * pnpm qr:render [--slug vv26] [--out qr] [--pdf]
 * Produit, pour chaque station : qr/<code>.png (1200 px, correction H), qr/<code>.svg,
 * puis qr/planche.html (une page A4 par station + récapitulatif) et, avec --pdf,
 * qr/planche.pdf via le Chromium de Playwright (PW_CHROMIUM pour un binaire local).
 * Les jetons doivent exister (pnpm qr:tokens) ; APP_BASE_URL donne le domaine des QR.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { arg } from "./_env";
import { ContentError, contentDir, loadContent } from "@/lib/content/load";
import { entryUrl, qrPng, qrSvg, sheetHtml, type SheetStation, shortUrl, stationUrl } from "@/lib/qr/render";

const slug = arg("slug") ?? "vv26";
const outDir = path.resolve(arg("out") ?? "qr");
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const wantPdf = process.argv.includes("--pdf");

async function main() {
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
  const missing = bundle.stations.filter((s) => !s.qr_token || !s.short_code);
  if (missing.length) {
    console.error(`✘ Jetons manquants pour ${missing.map((s) => s.code).join(", ")} : lancer pnpm qr:tokens d'abord.`);
    process.exit(1);
  }
  if (!/^https?:\/\//.test(baseUrl)) {
    console.error("✘ APP_BASE_URL doit être une URL absolue (ex. https://viceversa.example.be)");
    process.exit(1);
  }
  if (/localhost|127\.0\.0\.1/.test(baseUrl)) console.log("⚠ APP_BASE_URL pointe vers localhost : QR de test seulement.");

  mkdirSync(outDir, { recursive: true });
  const sheet: SheetStation[] = [];
  {
    const url = entryUrl(baseUrl, slug);
    const [png, svg] = await Promise.all([qrPng(url), qrSvg(url)]);
    writeFileSync(path.join(outDir, "ENTREE.png"), png);
    writeFileSync(path.join(outDir, "ENTREE.svg"), svg);
    sheet.push({ code: "ENTRÉE", title: { fr: "Entrée · ouvre l’application", nl: "Ingang · opent de app", en: "Entry · opens the app" }, shortCode: "", url, svg });
    console.log(`  ENTRÉE   ${url}`);
  }
  for (const s of bundle.stations) {
    const url = stationUrl(baseUrl, slug, s);
    const [png, svg] = await Promise.all([qrPng(url), qrSvg(url)]);
    writeFileSync(path.join(outDir, `${s.code}.png`), png);
    writeFileSync(path.join(outDir, `${s.code}.svg`), svg);
    sheet.push({ code: s.code, title: s.title, shortCode: s.short_code!, url, svg });
    console.log(`  ${s.code.padEnd(2)} ${s.short_code}  ${url}`);
  }
  const html = sheetHtml(bundle.event, sheet, shortUrl(baseUrl, slug));
  const htmlPath = path.join(outDir, "planche.html");
  writeFileSync(htmlPath, html);
  console.log(`✔ ${sheet.length} QR (PNG + SVG) et ${path.relative(process.cwd(), htmlPath)} dans ${path.relative(process.cwd(), outDir)}/`);

  if (wantPdf) {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`);
    const pdfPath = path.join(outDir, "planche.pdf");
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
    await browser.close();
    console.log(`✔ ${path.relative(process.cwd(), pdfPath)}`);
  }
}

main().catch((e) => {
  console.error(`✘ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
