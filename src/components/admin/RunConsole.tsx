"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { adminApi, AdminApiError, fmtDate } from "@/lib/admin/client";
import { useAdminUser } from "./AdminUserContext";
import { AuditTab } from "./tabs/AuditTab";
import { ExportTab } from "./tabs/ExportTab";
import { ModerationTab } from "./tabs/ModerationTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { PhasesTab } from "./tabs/PhasesTab";
import { ProjectionTab } from "./tabs/ProjectionTab";
import { can, type RunDto } from "./types";
import { Alert, Button, ConfirmModal, KindBadge, PhaseBadge, Spinner, StatusBadge } from "./ui";

const TABS = [
  { key: "phases", label: "Phases", min: "moderateur" },
  { key: "overview", label: "Vue d’ensemble", min: "moderateur" },
  { key: "moderation", label: "Modération", min: "moderateur" },
  { key: "projection", label: "Projection", min: "moderateur" },
  { key: "export", label: "Export", min: "admin" },
  { key: "audit", label: "Journal", min: "admin" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type Action = "start" | "close" | "reopen" | "reset" | "archive" | "delete";

export function RunConsole({ runId, initialTab }: { runId: string; initialTab?: string }) {
  const user = useAdminUser();
  const router = useRouter();
  const [run, setRun] = useState<RunDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>((TABS.some((t) => t.key === initialTab) ? initialTab : "phases") as TabKey);
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await adminApi<{ run: RunDto }>(`/api/admin/runs/${runId}`);
      setRun(r.run);
      setError(null);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Erreur");
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

  async function act(action: Action) {
    setBusy(true);
    setError(null);
    try {
      if (action === "delete") {
        await adminApi(`/api/admin/runs/${runId}`, { method: "DELETE" });
        router.push("/admin");
        return;
      }
      const r = await adminApi<{ run: RunDto }>(`/api/admin/runs/${runId}/${action}`, { method: "POST" });
      setRun(r.run);
      router.refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Action impossible");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  if (!run) return error ? <Alert kind="error">{error}</Alert> : <Spinner />;
  const isAdmin = can(user, "admin");
  const typedConfirm = run.label;

  const confirmations: Record<Action, { title: string; message: string; typed?: string; danger?: boolean; label: string }> = {
    start: {
      title: `Lancer « ${run.label} » ?`,
      message: "La séance passe en phase Accueil. Les téléphones ayant participé à une séance précédente repartiront de zéro.",
      label: "Lancer",
    },
    close: {
      title: `Stopper « ${run.label} » ?`,
      message: `Les résultats sont figés et les participants voient l’écran Merci. ${run.kind === "live" ? "Cette action est définitive pour une séance Live." : "Une séance de test peut être rouverte."}`,
      typed: typedConfirm,
      danger: true,
      label: "Stopper",
    },
    reopen: { title: "Rouvrir la séance ?", message: "La séance repasse en cours, en phase Trace finale.", label: "Rouvrir" },
    reset: {
      title: "Réinitialiser la séance ?",
      message: "Toutes les sessions, visites et réponses de cette séance sont supprimées. La phase revient à Accueil.",
      typed: typedConfirm,
      danger: true,
      label: "Réinitialiser",
    },
    archive: { title: "Archiver la séance ?", message: "Les données participants sont supprimées ; le résumé agrégé et les exports restent.", label: "Archiver" },
    delete: { title: "Supprimer la séance ?", message: "Suppression définitive de la séance et de ses données.", typed: typedConfirm, danger: true, label: "Supprimer" },
  };

  const actions: { action: Action; show: boolean; variant: "primary" | "secondary" | "danger" }[] = [
    { action: "start", show: isAdmin && run.status === "draft", variant: "primary" },
    { action: "close", show: isAdmin && run.status === "live", variant: "danger" },
    { action: "reopen", show: isAdmin && run.status === "closed" && run.kind !== "live", variant: "secondary" },
    { action: "reset", show: isAdmin && (run.status === "live" || run.status === "closed") && !(run.kind === "live" && run.status === "live" && run.sessions > 0), variant: "secondary" },
    { action: "archive", show: isAdmin && run.status === "closed", variant: "secondary" },
    { action: "delete", show: isAdmin && (run.status === "draft" || run.kind === "test"), variant: "secondary" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <KindBadge kind={run.kind} />
            <StatusBadge status={run.status} />
            {run.status !== "draft" && <PhaseBadge phase={run.phase} />}
          </div>
          <h1 className="mt-2 text-3xl">
            {run.kind === "test" && <span className="mr-2 text-muted">[TEST]</span>}
            {run.label}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {run.sessions} session(s) · {run.active_sessions} active(s)
            {run.started_at && ` · lancée ${fmtDate(run.started_at)}${run.started_by ? ` par ${run.started_by}` : ""}`}
            {run.closed_at && ` · clôturée ${fmtDate(run.closed_at)}${run.closed_by ? ` par ${run.closed_by}` : ""}`}
          </p>
          {run.notes && <p className="mt-1 max-w-2xl text-sm">{run.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.filter((a) => a.show).map((a) => (
            <Button key={a.action} variant={a.variant} onClick={() => setPending(a.action)} disabled={busy}>
              {confirmations[a.action].label}
            </Button>
          ))}
        </div>
      </header>

      {error && <Alert kind="error">{error}</Alert>}
      {run.status === "draft" && <Alert kind="info">Séance en brouillon : invisible des participants tant qu’elle n’est pas lancée.</Alert>}

      <nav className="flex gap-1 border-b border-state-locked" aria-label="Onglets">
        {TABS.filter((t) => can(user, t.min)).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              window.history.replaceState(null, "", `?tab=${t.key}`);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === t.key ? "border-green-deep text-green-deep" : "border-transparent text-muted hover:text-ink"}`}
            aria-current={tab === t.key ? "page" : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "phases" && <PhasesTab run={run} onChange={setRun} />}
      {tab === "overview" && <OverviewTab runId={run.id} />}
      {tab === "moderation" && <ModerationTab runId={run.id} />}
      {tab === "projection" && <ProjectionTab run={run} onChange={setRun} />}
      {tab === "export" && <ExportTab run={run} />}
      {tab === "audit" && <AuditTab runId={run.id} />}

      {pending && (
        <ConfirmModal
          open
          title={confirmations[pending].title}
          message={confirmations[pending].message}
          typed={confirmations[pending].typed}
          confirmLabel={confirmations[pending].label}
          danger={confirmations[pending].danger}
          busy={busy}
          onConfirm={() => act(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
