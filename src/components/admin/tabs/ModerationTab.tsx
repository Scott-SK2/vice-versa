"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, fmtTime } from "@/lib/admin/client";
import { Alert, Button, Card, Spinner } from "../ui";

type Item = { id: number; question_key: string; question: string; source: string; text: string; status: string; updated_at: string; moderated_by: string | null };
type Status = "pending" | "approved" | "rejected";

export function ModerationTab({ runId }: { runId: string }) {
  const [status, setStatus] = useState<Status>("pending");
  const [items, setItems] = useState<Item[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);

  const load = useCallback(
    async (append = false, before?: string | null) => {
      try {
        const q = new URLSearchParams({ status, limit: "50" });
        if (before) q.set("before", before);
        const r = await adminApi<{ items: Item[]; next_cursor: string | null }>(`/api/admin/runs/${runId}/answers?${q}`);
        setItems((prev) => (append && prev ? [...prev, ...r.items] : r.items));
        setNext(r.next_cursor);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    },
    [runId, status],
  );

  useEffect(() => {
    const first = setTimeout(() => load(), 0);
    const id = setInterval(() => load(), 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  async function decide(id: number, decision: "approved" | "rejected") {
    try {
      await adminApi(`/api/admin/answers/${id}/moderate`, { method: "POST", body: { decision } });
      setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!items?.length || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const current = items[Math.min(focus, items.length - 1)];
      if (e.key === "v" || e.key === "V") decide(current.id, "approved");
      if (e.key === "r" || e.key === "R") decide(current.id, "rejected");
      if (e.key === "ArrowDown") setFocus((f) => Math.min(f + 1, items.length - 1));
      if (e.key === "ArrowUp") setFocus((f) => Math.max(f - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, focus]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-button border border-state-locked bg-white p-1">
          {(["pending", "approved", "rejected"] as Status[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-button px-3 py-1.5 text-sm font-semibold ${status === s ? "bg-green-deep text-paper" : "text-muted hover:text-ink"}`}
            >
              {{ pending: "En attente", approved: "Validés", rejected: "Refusés" }[s]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Raccourcis : V valider · R refuser · ↑ ↓ naviguer</p>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {!items && <Spinner />}
      {items && items.length === 0 && <Card><p className="text-sm text-muted">Rien dans cette liste.</p></Card>}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li key={it.id} className={`flex items-start justify-between gap-4 rounded-card border bg-white p-4 ${i === focus ? "border-green-deep" : "border-state-locked"}`} onMouseEnter={() => setFocus(i)}>
              <div className="min-w-0">
                <p className="text-xs text-muted">
                  {it.source} · {it.question} · {fmtTime(it.updated_at)}
                  {it.moderated_by && ` · ${it.status === "approved" ? "validé" : "refusé"} par ${it.moderated_by}`}
                </p>
                <p className="mt-1 text-base">« {it.text} »</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {it.status !== "approved" && <Button size="sm" variant="primary" onClick={() => decide(it.id, "approved")}>Valider</Button>}
                {it.status !== "rejected" && <Button size="sm" variant="danger" onClick={() => decide(it.id, "rejected")}>Refuser</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {next && <Button onClick={() => load(true, next)}>Charger la suite</Button>}
    </div>
  );
}
