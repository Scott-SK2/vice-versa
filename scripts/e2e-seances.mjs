/**
 * Enchaînement de séances côté participant (fermeture, nouvelle séance, bouton de sortie).
 * Prérequis : serveur local démarré (pnpm build && pnpm start -p 3100) et DATABASE_URL dans .env.
 *   node scripts/e2e-seances.mjs [http://localhost:3100]
 */
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
const B = process.argv[2] ?? "http://localhost:3100";
const sh = (c) => execSync(c, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const create = (label) => { const out = sh(`pnpm -s seance create --label "${label}" --kind test`); const id = /([0-9a-f-]{36})/.exec(out)[1]; sh(`pnpm -s seance start --id ${id}`); return id; };
const step = (n, ok, info = "") => { console.log(`${ok ? "✔" : "✘"} ${n}${info ? " — " + info : ""}`); if (!ok) process.exitCode = 1; };
const vis = async (page, name, ms = 25000) => { try { await page.getByRole("button", { name }).waitFor({ state: "visible", timeout: ms }); return true; } catch { return false; } };
const waitUrl = async (page, re, ms = 20000) => { try { await page.waitForURL(re, { timeout: ms }); return true; } catch { return false; } };

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));

const runA = create("Test A");
await page.goto(`${B}/vv26`);
await page.getByRole("button", { name: "Commencer" }).click();
step("1. Commencer → écran Avant", await waitUrl(page, /\/vv26\/avant/), page.url());

sh(`pnpm -s seance close --id ${runA}`);
step("2. Séance fermée → page Merci", await waitUrl(page, /\/vv26\/merci/, 25000), page.url());
step("3. Bouton « Revenir à l’accueil » visible", await vis(page, "Revenir à l’accueil", 5000));

await page.reload();
await page.waitForTimeout(2500);
step("4. Après rechargement : toujours Merci avec le bouton", /\/vv26\/merci/.test(page.url()) && (await page.getByRole("button", { name: "Revenir à l’accueil" }).isVisible().catch(() => false)), page.url());

const runB = create("Test B");
step("5. Nouvelle séance lancée → retour à l’accueil automatique", await waitUrl(page, /\/vv26$/, 25000), page.url());
const startBtn = await vis(page, "Commencer", 8000);
step("6. Bouton « Commencer » proposé", startBtn);
await page.getByRole("button", { name: "Commencer" }).click();
step("7. Nouvelle participation démarrée (séance B)", await waitUrl(page, /\/vv26\/avant/), page.url());

sh(`pnpm -s seance close --id ${runB}`);
step("8. Séance B fermée → Merci", await waitUrl(page, /\/vv26\/merci/, 25000), page.url());
await page.getByRole("button", { name: "Revenir à l’accueil" }).click();
await page.waitForTimeout(800);
const noRun = await page.getByText("Aucun atelier en cours").isVisible({ timeout: 5000 }).catch(() => false);
step("9. Bouton de sortie → accueil « Aucun atelier en cours »", /\/vv26$/.test(page.url()) && noRun, page.url());

const runC = create("Test C");
step("10. Séance C lancée → bouton Commencer réapparaît", await vis(page, "Commencer"));

await browser.close();
for (const id of [runA, runB, runC]) { try { sh(`pnpm -s seance close --id ${id}`); } catch {} try { sh(`pnpm -s seance delete --id ${id}`); } catch {} }
