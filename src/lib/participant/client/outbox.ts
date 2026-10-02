"use client";

/**
 * File d'attente persistée des réponses (05 § 3) : une réponse envoyée pendant une
 * coupure est renvoyée au retour du réseau, avec son horodatage d'origine.
 */
import { api, ParticipantApiError } from "./api";
import { storage } from "./storage";

export type OutboxItem = { id: string; key: string; value: unknown; client_ts: string; attempts: number };
const KEY = "vv.outbox";
const subscribers = new Set<() => void>();
let flushing = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function readOutbox(): OutboxItem[] {
  return storage.getJson<OutboxItem[]>(KEY, []);
}
function write(items: OutboxItem[]) {
  storage.setJson(KEY, items);
  for (const s of subscribers) s();
}
export function subscribeOutbox(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function enqueueAnswer(key: string, value: unknown, client_ts: string) {
  const items = readOutbox().filter((i) => i.key !== key);
  items.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, key, value, client_ts, attempts: 0 });
  write(items);
  scheduleFlush(1000);
}

export function scheduleFlush(delayMs: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushOutbox(), delayMs);
}

/** Vide la file dans l'ordre ; s'arrête à la première erreur réseau avec reprise exponentielle. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let items = readOutbox();
    while (items.length) {
      const item = items[0];
      try {
        await api(`/api/answers/${item.key}`, { method: "PUT", body: { value: item.value, client_ts: item.client_ts } });
        items = items.slice(1);
        write(items);
      } catch (e) {
        if (e instanceof ParticipantApiError && (e.isNetwork || e.status === 429 || e.status >= 500)) {
          item.attempts++;
          write(items);
          scheduleFlush(Math.min(30_000, 1000 * 2 ** Math.min(item.attempts, 5)));
          return;
        }
        // Réponse définitive (phase fermée, validation, session changée) : on abandonne l'élément.
        items = items.slice(1);
        write(items);
      }
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => scheduleFlush(200));
}
