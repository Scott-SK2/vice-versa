"use client";

import { storage } from "./storage";

export class ParticipantApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
}

/** Événements globaux émis par la couche API, écoutés par le store. */
export type SessionEvent = { type: "session_unknown" } | { type: "run_changed"; runId: string } | { type: "run_closed" } | { type: "phase_locked"; phase: string };
const listeners = new Set<(e: SessionEvent) => void>();
export function onSessionEvent(fn: (e: SessionEvent) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function emit(e: SessionEvent) {
  for (const l of listeners) l(e);
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = init.auth === false ? null : storage.getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(path, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), cache: "no-store" });
  } catch {
    throw new ParticipantApiError(0, "NETWORK", "offline");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    const err = new ParticipantApiError(res.status, e.code ?? "HTTP", e.message ?? `Erreur ${res.status}`, e.details);
    if (err.code === "SESSION_UNKNOWN") emit({ type: "session_unknown" });
    if (err.code === "RUN_CHANGED") emit({ type: "run_changed", runId: String(err.details?.run_id) });
    if (err.code === "RUN_CLOSED") emit({ type: "run_closed" });
    if (err.code === "PHASE_LOCKED") emit({ type: "phase_locked", phase: String(err.details?.phase) });
    throw err;
  }
  return data as T;
}
