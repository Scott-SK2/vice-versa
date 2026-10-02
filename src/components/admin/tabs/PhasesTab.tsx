"use client";

import { useEffect, useState } from "react";
import { adminApi, AdminApiError } from "@/lib/admin/client";
import { useAdminUser } from "../AdminUserContext";
import { can, type Phase, PHASES, type RunDto } from "../types";
import { Alert, Button, Card, ConfirmModal } from "../ui";

export function PhasesTab({ run, onChange }: { run: RunDto; onChange: (r: RunDto) => void }) {
  const user = useAdminUser();
  const [error, setError] = useState<string | null>(null);
  const [backTo, setBackTo] = useState<Phase | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const idx = PHASES.findIndex((p) => p.key === run.phase);
  const canDrive = can(user, "animateur") && run.status === "live";

  useEffect(() => {
    const tick = () => {
      const since = new Date(run.started_at ?? run.created_at).getTime();
      const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
      setElapsed(`${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [run.started_at, run.created_at]);

  async function go(phase: Phase, confirmBackwards = false) {
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi<{ run: RunDto }>(`/api/admin/runs/${run.id}/phase`, { method: "POST", body: { phase, confirm_backwards: confirmBackwards } });
      onChange(r.run);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Changement impossible");
    } finally {
      setBusy(false);
      setBackTo(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert kind="error">{error}</Alert>}
      <Card
        title="Phases"
        actions={
          canDrive && idx < PHASES.length - 1 ? (
            <Button variant="primary" onClick={() => go(PHASES[idx + 1].key)} disabled={busy}>
              Phase suivante : {PHASES[idx + 1].label} →
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-6 gap-2">
          {PHASES.map((p, i) => {
            const state = i < idx ? "past" : i === idx ? "current" : "future";
            const cls = {
              past: "bg-state-done/15 text-state-done border-state-done/30",
              current: "bg-yellow text-ink border-yellow shadow",
              future: "bg-white text-muted border-state-locked",
            }[state];
            const clickable = canDrive && (i === idx + 1 || i < idx);
            return (
              <button
                key={p.key}
                disabled={!clickable || busy}
                onClick={() => (i < idx ? setBackTo(p.key) : go(p.key))}
                className={`flex min-h-20 flex-col items-start rounded-card border px-3 py-2 text-left ${cls} ${clickable ? "hover:brightness-95" : "cursor-default"}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className="text-xs uppercase tracking-wide opacity-70">{i + 1}</span>
                <span className="font-display text-base font-extrabold">{p.label}</span>
                <span className="text-xs opacity-80">{p.duration}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-sm text-muted">
          {run.status === "live" ? <>Séance lancée depuis <strong>{elapsed}</strong>. Le passage de phase est toujours manuel ; un retour en arrière demande une confirmation.</> : "La séance n’est pas en cours : les phases ne se pilotent pas."}
        </p>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Côté participant">
          <p className="text-sm">{PHASES[idx].participant}</p>
        </Card>
        <Card title="Côté animateur">
          <p className="text-sm">{PHASES[idx].animateur}</p>
        </Card>
      </div>
      <ConfirmModal
        open={backTo !== null}
        title={`Revenir à « ${PHASES.find((p) => p.key === backTo)?.label} » ?`}
        message="Les participants reverront l’écran de cette phase. L’action est journalisée."
        confirmLabel="Revenir en arrière"
        busy={busy}
        onConfirm={() => backTo && go(backTo, true)}
        onCancel={() => setBackTo(null)}
      />
    </div>
  );
}
