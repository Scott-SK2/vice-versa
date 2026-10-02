/**
 * Proxy Next.js (ex-middleware) : génère un nonce par requête, le transmet au rendu via
 * l'en-tête Content-Security-Policy de la requête (Next.js y lit le nonce pour ses scripts
 * inline) et pose la CSP sur la réponse. Les routes API et les fichiers statiques sont exclus.
 */
import { type NextRequest, NextResponse } from "next/server";
import { buildCsp, mediaOriginFrom, newNonce } from "@/lib/security/csp";

const mediaOrigin = mediaOriginFrom(process.env.MEDIA_BASE_URL);
const dev = process.env.NODE_ENV !== "production";

export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp({ nonce, mediaOrigin, dev });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages uniquement : pas les routes API, les assets Next, les médias ni les fichiers statiques.
      source: "/((?!api/|_next/static|_next/image|media/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|json|vtt|mp4|webm)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
