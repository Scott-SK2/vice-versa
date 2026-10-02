"use client";

import { useEffect, useState } from "react";
import { adminApi, fmtDate } from "@/lib/admin/client";
import { Alert, Card, Spinner } from "../ui";

type Entry = { id: number; at: string; action: string; payload: Record<string, unknown> | null; actor: string | null };

const LABELS: Record<string, string> = {
  "run.create": "Séance créée",
  "run.update": "Séance modifiée",
  "run.start": "Séance lancée",
  "run.phase": "Changement de phase",
  "run.close": "Séance stoppée",
  "run.reopen": "Séance rouverte",
  "run.reset": "Séance réinitialisée",
  "run.archive": "Séance archivée",
  "answer.moderate": "Modération",
  "slide.set": "Diapositive projetée",
  export: "Export",
};

export function AuditTab({ runId }: { runId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi<{ entries: Entry[] }>(`/api/admin/runs/${runId}/audit`)
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [runId]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!entries) return <Spinner />;
  return (
    <Card title="Journal de la séance">
      {entries.length === 0 && <p className="text-sm text-muted">Aucune action enregistrée.</p>}
      <ul className="divide-y divide-state-locked/70 text-sm">
        {entries.map((e) => (
          <li key={e.id} className="flex items-baseline gap-4 py-2">
            <span className="w-40 shrink-0 text-muted">{fmtDate(e.at)}</span>
            <span className="w-44 shrink-0 font-semibold">{LABELS[e.action] ?? e.action}</span>
            <span className="w-32 shrink-0 text-muted">{e.actor ?? "système"}</span>
            <span className="truncate text-muted">{e.payload ? JSON.stringify(e.payload) : ""}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
