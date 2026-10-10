import jsQR from "jsqr";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { contentDir, loadContent } from "@/lib/content/load";
import { qrPng, qrSvg, sheetHtml, shortUrl, stationUrl, entryUrl } from "@/lib/qr/render";

const bundle = loadContent(contentDir("vv26"));
const base = "https://viceversa.example.be";

function decode(png: Buffer): string | null {
  const img = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data ?? null;
}

describe("QR codes", () => {
  it("construit les URL : entrée sans jeton, chaque station (A comprise) avec son jeton", () => {
    const a = bundle.stations.find((s) => s.code === "A")!;
    const s3 = bundle.stations.find((s) => s.code === "3")!;
    expect(stationUrl(base, "vv26", a)).toBe(`${base}/vv26/s/A?k=${a.qr_token}`);
    expect(entryUrl(base, "vv26")).toBe(`${base}/vv26`);
    expect(stationUrl(base, "vv26", s3)).toBe(`${base}/vv26/s/3?k=${s3.qr_token}`);
    expect(shortUrl(base, "vv26")).toBe("viceversa.example.be/vv26");
  });

  it("génère un PNG lisible qui décode exactement l'URL", async () => {
    const s3 = bundle.stations.find((s) => s.code === "3")!;
    const url = stationUrl(base, "vv26", s3);
    const png = await qrPng(url, 400);
    expect(decode(png)).toBe(url);
  });

  it("génère un SVG et une planche avec toutes les stations et les codes courts", async () => {
    const svg = await qrSvg(`${base}/vv26`);
    expect(svg).toContain("<svg");
    const sheet = sheetHtml(
      bundle.event,
      bundle.stations.map((s) => ({ code: s.code, title: s.title, shortCode: s.short_code!, url: stationUrl(base, "vv26", s), svg })),
      shortUrl(base, "vv26"),
    );
    for (const s of bundle.stations) {
      expect(sheet).toContain(s.short_code);
      expect(sheet).toContain(s.title.fr.replace(/&/g, "&amp;"));
    }
    expect(sheet.match(/class="page"/g)).toHaveLength(bundle.stations.length);
  });
});
