"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, fmtTime } from "@/lib/admin/client";
import { Alert, Bar, Card, Spinner } from "../ui";

type Dashboard = {
  sessions: { total: number; active: number; completed: number };
  avg_progress: number;
  before_done: number;
  after_done: number;
  pending_texts: number;
  traces: number;
  stations: { code: string; title: string; counts_in_progress: boolean; opened: number; completed: number }[];
  sessions_by_5min: { at: string; count: number }[];
  generated_at: string;
};

export function OverviewTab({ runId }: { runId: string }) {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await adminApi<Dashboard>(`/api/admin/runs/${runId}/dashboard`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, [runId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!d) return <Spinner />;
  const maxOpened = Math.max(1, ...d.stations.map((s) => s.opened));
  const maxBucket = Math.max(1, ...d.sessions_by_5min.map((b) => b.count));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Sessions" value={d.sessions.total} sub={`${d.sessions.active} active(s) · ${d.sessions.completed} à 8/8`} />
        <Stat label="Progression moyenne" value={`${d.avg_progress} %`} />
        <Stat label="Questions « Avant » remplies" value={d.before_done} sub={`« Après » : ${d.after_done}`} />
        <Stat label="Textes à modérer" value={d.pending_texts} sub={`${d.traces} trace(s) laissée(s)`} highlight={d.pending_texts > 0} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Fréquentation par station">
          <div className="flex flex-col gap-3">
            {d.stations.map((s) => (
              <Bar
                key={s.code}
                label={`${s.code} · ${s.title}`}
                value={s.opened}
                max={maxOpened}
                sublabel={`${s.completed} terminée(s) / ${s.opened} ouverte(s)`}
                color={s.counts_in_progress ? "bg-green-deep" : "bg-state-locked-text/60"}
              />
            ))}
          </div>
        </Card>
        <Card title="Arrivées par tranche de 5 minutes">
          {d.sessions_by_5min.length === 0 && <p className="text-sm text-muted">Aucune session pour l’instant.</p>}
          <div className="flex h-40 items-end gap-1">
            {d.sessions_by_5min.map((b) => (
              <div key={b.at} className="flex flex-1 flex-col items-center gap-1" title={`${b.at} : ${b.count}`}>
                <div className="w-full rounded-t bg-green-deep" style={{ height: `${Math.max(4, (b.count / maxBucket) * 140)}px` }} />
                <span className="text-[10px] text-muted">{b.at}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <p className="text-xs text-muted">Données agrégées et anonymes, rafraîchies toutes les 10 s (dernière : {fmtTime(d.generated_at)}).</p>
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string | number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-card border p-5 ${highlight ? "border-state-progress bg-state-progress/10" : "border-state-locked bg-white"}`}>
      <p className="font-display text-4xl font-extrabold text-green-deep">{value}</p>
      <p className="text-sm font-semibold">{label}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
