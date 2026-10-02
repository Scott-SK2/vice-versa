/**
 * Parcours participant de bout en bout dans Chromium (360 px), les phases étant pilotées
 * avec pnpm seance. Exige un serveur démarré (BASE, défaut http://localhost:3000) et une
 * base migrée et seedée.
 *
 *   pnpm build && pnpm start &
 *   pnpm test:e2e            # OUT=./e2e-shots pour conserver les captures
 *
 * PW_CHROMIUM : chemin d'un Chromium déjà installé (sinon celui de Playwright).
 */
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:3000";
const out = process.env.OUT;
const sh = (c) => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const stations = JSON.parse(readFileSync("content/vv26/stations.json", "utf8"));
const st = (code) => stations.find((s) => s.code === code);

if (out) mkdirSync(out, { recursive: true });
const created = sh(`pnpm -s seance create --label "E2E participant" --kind test`);
const runId = /Séance créée ([0-9a-f-]{36})/.exec(created)[1];
const phase = (p, back = false) => sh(`pnpm -s seance phase --id ${runId} --to ${p}${back ? " --back" : ""}`);
sh(`pnpm -s seance start --id ${runId}`);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
// Les 409 (RUN_CLOSED / RUN_CHANGED) font partie du scénario : le navigateur les journalise comme des échecs de ressource.
page.on("console", (m) => { if (m.type() === "error" && !/409/.test(m.text())) errors.push("console: " + m.text()); });
page.on("response", (r) => { if (r.status() >= 500) errors.push("http " + r.status() + " " + r.url()); });
const shot = (n) => out && page.screenshot({ path: `${out}/p-${n}.png`, fullPage: true });
const step = (msg) => console.log("· " + msg);

try {
  await page.goto(base + "/vv26");
  await page.waitForSelector("text=Commencer", { timeout: 15000 });
  step("accueil");
  await shot("01-accueil");
  await page.click("text=Nederlands");
  await page.click("text=Beginnen");
  await page.waitForURL("**/vv26/avant", { timeout: 15000 });
  await page.waitForSelector("text=Vraag 1 van 3", { timeout: 15000 });
  step("avant (NL)");
  await shot("02-avant");
  await page.click("text=In Europa");
  await page.click("button:has-text('Volgende')");
  await page.waitForSelector("text=Vraag 2 van 3");
  for (const [i, w] of ["regen", "treinen", "frieten"].entries()) await page.fill(`input[aria-label='Woord ${i + 1}']`, w);
  await page.click("button:has-text('Volgende')");
  await page.waitForSelector("text=Vraag 3 van 3");
  for (const [i, w] of ["zon", "familie", "muziek"].entries()) await page.fill(`input[aria-label='Woord ${i + 1}']`, w);
  await page.click("button:has-text('Mijn antwoord versturen')");
  await page.waitForURL("**/vv26/parcours", { timeout: 15000 });
  step("parcours");
  await page.waitForSelector("text=0/8 stations");
  await shot("03-parcours");

  // Station verrouillée depuis la liste
  await page.click("text=Het beeld van de ander");
  await page.waitForSelector("text=Ga naar de affiche");
  // Scan par URL QR (accueil : la station s'ouvre, la question attend la phase parcours)
  await page.goto(`${base}/vv26/s/3?k=${st("3").qr_token}`);
  await page.waitForSelector("text=Waarom naar Afrika gaan?", { timeout: 15000 });
  await page.waitForFunction(() => !location.search.includes("k="));
  step("station 3 débloquée par QR, URL nettoyée");
  await shot("04-station-accueil");

  phase("parcours");
  await page.reload();
  await page.waitForSelector("text=Waarom naar Afrika gaan?");
  await page.click("text=Daar een project opzetten");
  await page.click("button:has-text('Mijn antwoord versturen')");
  await page.waitForURL("**/vv26/s/3/ok", { timeout: 15000 });
  await page.waitForSelector("text=1/8 stations");
  step("station 3 terminée, 1/8");
  await shot("05-station-ok");

  // Code court via l'onglet Saisir un code
  await page.goto(base + "/vv26/scanner");
  await page.fill("input[maxlength='4']", st("1").short_code.toLowerCase());
  await page.click("button:has-text('Bevestigen')");
  await page.waitForURL("**/vv26/s/1", { timeout: 15000 });
  await page.click("text=Een jongere uit België");
  await page.click("button:has-text('Mijn antwoord versturen')");
  await page.waitForSelector("text=Mis: het was", { timeout: 15000 });
  step("station 1 guess_reveal : révélation");
  await shot("06-station-reveal");

  await page.goto(base + "/vv26/carte");
  await page.waitForSelector("button[aria-label^='3 ·']");
  step("carte");
  await shot("07-carte");

  // Station 7 : 3 affirmations
  await page.goto(`${base}/vv26/s/7?k=${st("7").qr_token}`);
  await page.waitForSelector("text=Vooroordelen");
  const forms = page.locator("section");
  for (let i = 0; i < 3; i++) {
    await forms.nth(i).locator("button:has-text('Het hangt ervan af')").click();
    await forms.nth(i).locator("button:has-text('Mijn antwoord versturen')").click();
    await page.waitForTimeout(400);
  }
  await page.waitForURL("**/vv26/s/7/ok", { timeout: 15000 });
  step("station 7 : trois affirmations → terminée");

  // Phase Après : bannière puis questions pairées
  phase("apres");
  await page.goto(base + "/vv26/parcours");
  await page.waitForSelector("text=De slotvragen zijn open", { timeout: 20000 });
  step("bannière questions finales");
  await shot("08-parcours-apres");
  await page.click("text=De slotvragen beantwoorden");
  await page.waitForSelector("text=Vraag 1 van 4");
  await page.click("text=In Afrika");
  await page.click("button:has-text('Volgende')");
  await page.waitForSelector("text=Vraag 2 van 4");
  for (const [i, w] of ["regen", "koud", "werk"].entries()) await page.fill(`input[aria-label='Woord ${i + 1}']`, w);
  await page.click("button:has-text('Volgende')");
  await page.waitForSelector("text=Vraag 3 van 4");
  for (const [i, w] of ["zon", "familie", "ondernemen"].entries()) await page.fill(`input[aria-label='Woord ${i + 1}']`, w);
  await page.click("button:has-text('Volgende')");
  await page.waitForSelector("text=Vraag 4 van 4");
  await page.fill("textarea", "De energie van de stad");
  await page.click("button:has-text('Mijn antwoord versturen')");
  await page.waitForURL("**/vv26/bilan", { timeout: 15000 });
  await page.waitForSelector("text=In Europa");
  await page.waitForSelector("text=In Afrika");
  step("bilan avant / après");
  await shot("09-bilan");

  // Discussion : navigation forcée par le sondage, stations en lecture seule
  phase("discussion");
  await page.goto(base + "/vv26/s/3");
  await page.waitForSelector("text=Het parcours is afgelopen", { timeout: 15000 });
  step("station en lecture seule");

  phase("trace");
  await page.waitForURL("**/vv26/trace", { timeout: 20000 });
  step("navigation automatique vers la trace");
  await page.fill("textarea", "Meer vragen dan antwoorden, en dat is goed.");
  await page.click("button:has-text('Mijn spoor achterlaten')");
  await page.waitForSelector("text=Bedankt, je spoor is opgeslagen");
  await shot("10-trace");

  sh(`pnpm -s seance close --id ${runId}`);
  await page.goto(base + "/vv26/parcours");
  await page.waitForURL("**/vv26/merci", { timeout: 20000 });
  await page.waitForSelector("text=Bedankt!");
  step("séance stoppée → merci");
  await shot("11-merci");

  // Nouvelle séance : le téléphone repart de zéro
  const c2 = sh(`pnpm -s seance create --label "E2E participant 2" --kind test`);
  const run2 = /Séance créée ([0-9a-f-]{36})/.exec(c2)[1];
  sh(`pnpm -s seance start --id ${run2}`);
  await page.goto(base + "/vv26/parcours");
  await page.waitForURL("**/vv26", { timeout: 20000 });
  await page.waitForSelector("text=Beginnen", { timeout: 15000 });
  step("nouvelle séance → accueil, langue conservée (NL)");
  await shot("12-nouvelle-seance");
  sh(`pnpm -s seance close --id ${run2}`);
  sh(`pnpm -s seance delete --id ${run2}`);

  console.log(errors.length ? "ERREURS NAVIGATEUR:\n" + errors.join("\n") : "OK — aucune erreur navigateur");
  if (errors.length) process.exitCode = 1;
} catch (e) {
  await shot("99-failure");
  console.error("ÉCHEC :", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  try { sh(`pnpm -s seance delete --id ${runId}`); } catch {}
}
