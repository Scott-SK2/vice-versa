/**
 * Génération des QR codes des stations (07 § 4) : URL stable par station, PNG et SVG
 * à haut niveau de correction, planche d'affiches A4 imprimable.
 */
import QRCode from "qrcode";
import type { EventFile, StationFile } from "@/lib/content/schema";

export const QR_OPTIONS = { errorCorrectionLevel: "H" as const, margin: 4 };

/** URL portée par le QR. Le repère A ouvre l'accueil (règle 6 du cahier) ; les autres ouvrent la station avec son jeton. */
export function stationUrl(baseUrl: string, eventSlug: string, station: Pick<StationFile, "code" | "qr_token">): string {
  const base = baseUrl.replace(/\/$/, "");
  if (station.code === "A") return `${base}/${eventSlug}`;
  if (!station.qr_token) throw new Error(`Station ${station.code} sans jeton QR`);
  return `${base}/${eventSlug}/s/${station.code}?k=${station.qr_token}`;
}

/** URL courte imprimée sous le QR (sans jeton) ; le code court suffit pour déverrouiller. */
export function shortUrl(baseUrl: string, eventSlug: string): string {
  return `${baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/${eventSlug}`;
}

export async function qrPng(url: string, widthPx = 1200): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png", width: widthPx });
}

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg" });
}

export type SheetStation = {
  code: string;
  title: { fr: string; nl?: string; en?: string };
  shortCode: string;
  url: string;
  svg: string;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Planche d'affiches : une page A4 par station (QR, repère, titre FR/NL/EN, URL courte,
 * code à 4 caractères lisible à 2 m) plus une page récapitulative pour les organisateurs.
 */
export function sheetHtml(event: EventFile, stations: SheetStation[], short: string): string {
  const pages = stations
    .map(
      (s) => `
  <section class="page">
    <header>
      <span class="brand">VICE VERSA</span>
      <span class="tagline">Deux regards, deux continents</span>
    </header>
    <div class="code-badge">${esc(s.code)}</div>
    <h1>${esc(s.title.fr)}</h1>
    <p class="alt">${esc(s.title.nl ?? "")}${s.title.nl && s.title.en ? " · " : ""}${esc(s.title.en ?? "")}</p>
    <div class="qr">${s.svg}</div>
    <p class="scan">Scanne-moi avec l’appareil photo · Scan me met je camera · Scan me with your camera</p>
    <div class="fallback">
      <p class="url">${esc(short)}</p>
      <p class="label">Sans QR, saisis le code · Zonder QR, voer de code in · Without QR, enter the code</p>
      <p class="short">${esc(s.shortCode)}</p>
    </div>
  </section>`,
    )
    .join("\n");

  const rows = stations
    .map((s) => `<tr><td>${esc(s.code)}</td><td>${esc(s.title.fr)}</td><td class="mono">${esc(s.shortCode)}</td><td class="mono small">${esc(s.url)}</td></tr>`)
    .join("\n");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${esc(event.name)} — Affiches QR</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; font-family: "Figtree", "Helvetica Neue", Arial, sans-serif; color: #14231C; background: #fff; }
  .page { page-break-after: always; height: 273mm; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 6mm 10mm; border: 1.2mm solid #0E4D36; border-radius: 8mm; }
  header { width: 100%; display: flex; justify-content: space-between; font-weight: 800; color: #0E4D36; font-size: 14pt; }
  header .tagline { font-weight: 500; color: #5A6560; }
  .code-badge { margin-top: 8mm; width: 30mm; height: 30mm; border-radius: 999px; background: #F4B400; color: #14231C; font-size: 44pt; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  h1 { font-size: 30pt; margin: 6mm 0 2mm; line-height: 1.1; }
  .alt { color: #5A6560; font-size: 13pt; margin: 0 0 4mm; }
  .qr { width: 110mm; height: 110mm; }
  .qr svg { width: 100%; height: 100%; }
  .scan { font-size: 10.5pt; color: #5A6560; margin: 3mm 0 6mm; }
  .fallback { margin-top: auto; width: 100%; background: #FAF6EC; border-radius: 6mm; padding: 5mm; }
  .url { font-size: 16pt; font-weight: 700; margin: 0; }
  .label { font-size: 9.5pt; color: #5A6560; margin: 1mm 0 2mm; }
  .short { font-family: "Courier New", monospace; font-size: 52pt; font-weight: 800; letter-spacing: 0.25em; margin: 0; color: #0E4D36; }
  .recap { padding: 4mm; }
  .recap h1 { font-size: 20pt; text-align: left; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border-bottom: 0.3mm solid #D5D2C8; padding: 2mm; text-align: left; vertical-align: top; }
  .mono { font-family: "Courier New", monospace; }
  .small { font-size: 8pt; word-break: break-all; }
  .note { font-size: 9pt; color: #5A6560; }
</style>
</head>
<body>
${pages}
  <section class="page recap">
    <h1>${esc(event.name)} — récapitulatif des QR (organisateurs, ne pas afficher)</h1>
    <p class="note">Jetons figés avant impression : toute modification oblige à réimprimer. Vérifier chaque affiche en scannant à 1 m et à 2 m, en éclairage faible, sur iPhone et Android.</p>
    <table>
      <thead><tr><th>Repère</th><th>Station</th><th>Code</th><th>URL du QR</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </section>
</body>
</html>
`;
}
