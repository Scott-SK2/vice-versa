/**
 * pnpm qr:tokens [--slug vv26]
 * Attribue un jeton QR (8 caractères) et un code court (4 caractères) à chaque station
 * qui n'en a pas encore, et réécrit stations.json. Ne modifie jamais un jeton existant :
 * pour en régénérer un, supprimer la valeur dans le fichier.
 * La génération des PNG et de la planche d'affiches viendra dans scripts/qr-render.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { arg } from "./_env";
import { contentDir } from "@/lib/content/load";
import { newQrToken, newShortCode } from "@/lib/domain/tokens";

const slug = arg("slug") ?? "vv26";
const file = path.join(contentDir(slug), "stations.json");
type S = { code: string; qr_token?: string; short_code?: string; [k: string]: unknown };
const stations = JSON.parse(readFileSync(file, "utf8")) as S[];

const tokens = new Set(stations.map((s) => s.qr_token).filter(Boolean));
const codes = new Set(stations.map((s) => s.short_code).filter(Boolean));
let changed = 0;
for (const s of stations) {
  if (!s.qr_token) {
    let t = newQrToken();
    while (tokens.has(t)) t = newQrToken();
    tokens.add(t);
    s.qr_token = t;
    changed++;
  }
  if (!s.short_code) {
    let c = newShortCode();
    while (codes.has(c)) c = newShortCode();
    codes.add(c);
    s.short_code = c;
    changed++;
  }
}
if (changed) {
  writeFileSync(file, JSON.stringify(stations, null, 2) + "\n");
  console.log(`✔ ${changed} valeur(s) générée(s) dans ${path.relative(process.cwd(), file)}`);
} else {
  console.log("✔ Toutes les stations ont déjà un jeton et un code court.");
}
for (const s of stations) console.log(`  ${s.code.padEnd(2)} /${slug}/s/${s.code}?k=${s.qr_token}   code ${s.short_code}`);
