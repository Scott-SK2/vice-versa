/** Jeton et langue côté navigateur : localStorage, cookie de secours (05 § 2). */
const TOKEN_KEY = "vv.session";
const LANG_KEY = "vv.lang";
const COOKIE = "vv_session";
const PENDING_KEY = "vv.pendingScan";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : le cookie prend le relais */
  }
}
function readCookie(name: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(document.cookie);
  return m ? decodeURIComponent(m[1]) : null;
}

export const storage = {
  getToken(): string | null {
    return safeGet(TOKEN_KEY) ?? readCookie(COOKIE);
  },
  setToken(token: string | null) {
    safeSet(TOKEN_KEY, token);
    document.cookie = token
      ? `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`
      : `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  },
  getLang(): string | null {
    return safeGet(LANG_KEY);
  },
  setLang(lang: string) {
    safeSet(LANG_KEY, lang);
  },
  /** Station scannée avant d'avoir une session : on y revient après l'accueil et les questions « Avant ». */
  getPendingScan(): { code: string; k: string } | null {
    const raw = safeGet(PENDING_KEY);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as { code?: string; k?: string };
      return v.code && v.k ? { code: v.code, k: v.k } : null;
    } catch {
      return null;
    }
  },
  setPendingScan(v: { code: string; k: string } | null) {
    safeSet(PENDING_KEY, v ? JSON.stringify(v) : null);
  },
  getJson<T>(key: string, fallback: T): T {
    const raw = safeGet(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  setJson(key: string, value: unknown) {
    safeSet(key, JSON.stringify(value));
  },
};
