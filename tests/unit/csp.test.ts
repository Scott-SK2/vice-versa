import { describe, expect, it } from "vitest";
import { buildCsp, mediaOriginFrom, newNonce } from "@/lib/security/csp";

describe("Content-Security-Policy", () => {
  it("n'autorise les scripts que par nonce et strict-dynamic, jamais unsafe-inline", () => {
    const csp = buildCsp({ nonce: "abc123" });
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("ajoute l'origine du CDN aux médias, images et connexions", () => {
    const csp = buildCsp({ nonce: "n", mediaOrigin: "https://cdn.example.net" });
    expect(csp).toContain("media-src 'self' blob: https://cdn.example.net");
    expect(csp).toContain("img-src 'self' data: blob: https://cdn.example.net");
    expect(csp).toContain("connect-src 'self' https://cdn.example.net");
    expect(mediaOriginFrom("https://cdn.example.net/vv26")).toBe("https://cdn.example.net");
    expect(mediaOriginFrom("/media")).toBeNull();
    expect(mediaOriginFrom(undefined)).toBeNull();
  });

  it("tolère eval en développement seulement", () => {
    expect(buildCsp({ nonce: "n", dev: true })).toContain("'unsafe-eval'");
    expect(buildCsp({ nonce: "n", dev: false })).not.toContain("'unsafe-eval'");
  });

  it("génère des nonces aléatoires en base64", () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(a, "base64")).toHaveLength(16);
  });
});
