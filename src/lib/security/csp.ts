/**
 * Content-Security-Policy avec nonce par requête (06 § 4, revue de sécurité S-CSP).
 * Les scripts ne sont autorisés que s'ils portent le nonce ou sont chargés par un script
 * qui le porte ('strict-dynamic') : plus de 'unsafe-inline' pour les scripts.
 */
export type CspOptions = {
  nonce: string;
  /** Origine absolue des médias (CDN) ou null si même origine. */
  mediaOrigin?: string | null;
  /** En développement, Next.js a besoin d'eval pour le rechargement à chaud. */
  dev?: boolean;
};

export function mediaOriginFrom(mediaBaseUrl: string | undefined): string | null {
  try {
    const origin = new URL(mediaBaseUrl ?? "/media").origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, mediaOrigin = null, dev = false }: CspOptions): string {
  const media = mediaOrigin ? ` ${mediaOrigin}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Les attributs style="" (barres de progression, positions sur le plan) ne peuvent pas porter de nonce.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${media}`,
    `media-src 'self' blob:${media}`,
    `connect-src 'self'${media}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
