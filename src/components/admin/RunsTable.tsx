"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminApi, fmtDate } from "@/lib/admin/client";
import { useAdminUser } from "./AdminUserContext";
import { can, PHASES, type RunDto } from "./types";
import { Alert, Button, Card, KindBadge, Spinner, StatusBadge } from "./ui";

export function RunsTable() {
  const user = useAdminUser();
  const [runs, setRuns] = useState<RunDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await adminApi<{ runs: RunDto[] }>("/api/admin/runs");
      setRuns(r.runs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  const live = runs?.find((r) => r.status === "live");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">Séances</h1>
        {can(user, "admin") && (
          <Link href="/admin/runs/new">
            <Button variant="primary">Nouvelle séance</Button>
          </Link>
        )}
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {live && (
        <Card className="border-state-done bg-state-done/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-state-done">Séance en cours</p>
              <p className="text-2xl">{live.label}</p>
              <p className="text-sm text-muted">
                Phase <strong>{PHASES.find((p) => p.key === live.phase)?.label}</strong> · {live.sessions} session(s), {live.active_sessions} active(s) · lancée {fmtDate(live.started_at)}
                {live.started_by ? ` par ${live.started_by}` : ""}
              </p>
            </div>
            <Link href={`/admin/runs/${live.id}`}>
              <Button variant="primary">Ouvrir la console</Button>
            </Link>
          </div>
        </Card>
      )}
      <Card>
        {!runs && <Spinner />}
        {runs && runs.length === 0 && <p className="text-sm text-muted">Aucune séance. Crée la première pour tester le parcours.</p>}
        {runs && runs.length > 0 && (
          <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2">Libellé</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Phase</th>
                <th className="text-right">Sessions</th>
                <th>Créée</th>
                <th>Lancée</th>
                <th>Clôturée</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-state-locked/70 hover:bg-paper">
                  <td className="py-3">
                    <Link href={`/admin/runs/${r.id}`} className="font-semibold text-green-deep underline-offset-2 hover:underline">
                      {r.label}
                    </Link>
                  </td>
                  <td><KindBadge kind={r.kind} /></td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.status === "live" || r.status === "closed" ? PHASES.find((p) => p.key === r.phase)?.label : "—"}</td>
                  <td className="text-right tabular-nums">
                    {r.sessions}
                    {r.status === "live" && <span className="text-muted"> ({r.active_sessions})</span>}
                  </td>
                  <td className="text-muted">{fmtDate(r.created_at)}{r.created_by ? ` · ${r.created_by}` : ""}</td>
                  <td className="text-muted">{fmtDate(r.started_at)}</td>
                  <td className="text-muted">{fmtDate(r.closed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
