"use client";

/** Appels à /api/admin/* depuis les composants client : cookie, en-tête CSRF, erreurs typées. */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function adminApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", "x-requested-with": "vv-admin" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new AdminApiError(res.status, e.code ?? "HTTP", e.message ?? `Erreur ${res.status}`, e.details);
  }
  return data as T;
}

export const fmtDate = (v: string | Date | null | undefined, withTime = true) =>
  v
    ? new Intl.DateTimeFormat("fr-BE", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(v))
    : "—";

export const fmtTime = (v: string | Date | null | undefined) =>
  v ? new Intl.DateTimeFormat("fr-BE", { timeStyle: "medium" }).format(new Date(v)) : "—";
