"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, AdminApiError, fmtDate } from "@/lib/admin/client";
import { Alert, Button, Card, ConfirmModal, Spinner } from "./ui";

type Status = {
  slug: string;
  loaded: { version: string | null; tokens_frozen_at: string | null; updated_at: string } | null;
  folder: { version: string; stations: number; questions: number; media: number; warnings: string[]; problems: string[] };
  up_to_date: boolean;
  media: { granted: number; pending: number; refused: number };
};

export function ContentAdmin() {
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"reload" | "freeze" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi<Status>("/api/admin/content/status")
      .then(setS)
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, []);
  useEffect(load, [load]);

  async function run(action: "reload" | "freeze") {
    setBusy(true);
    setError(null);
    try {
      if (action === "reload") {
        const r = await adminApi<{ version: string; warnings: string[] }>("/api/admin/content/reload", { method: "POST" });
        setNotice(`Contenu rechargé (version ${r.version}).${r.warnings.length ? ` ${r.warnings.length} avertissement(s).` : ""}`);
      } else {
        const r = await adminApi<{ tokens_frozen_at: string }>("/api/admin/content/freeze-tokens", { method: "POST" });
        setNotice(`Jetons gelés le ${fmtDate(r.tokens_frozen_at)}.`);
      }
      load();
    } catch (e) {
      setError(e instanceof AdminApiError ? [e.message, ...((e.details?.issues as string[]) ?? [])].join(" · ") : "Erreur");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (error && !s) return <Alert kind="error">{error}</Alert>;
  if (!s) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Contenu</h1>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Version chargée en base">
          {s.loaded ? (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Version</dt><dd><code>{s.loaded.version ?? "—"}</code></dd>
              <dt className="text-muted">Mise à jour</dt><dd>{fmtDate(s.loaded.updated_at)}</dd>
              <dt className="text-muted">Jetons QR</dt>
              <dd>{s.loaded.tokens_frozen_at ? <span className="font-semibold text-state-done">gelés le {fmtDate(s.loaded.tokens_frozen_at)}</span> : <span className="text-state-progress">pas encore gelés</span>}</dd>
              <dt className="text-muted">Médias</dt>
              <dd>{s.media.granted} publié(s) · {s.media.pending} en attente de consentement · {s.media.refused} refusé(s)</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted">Aucun événement en base : lancer un rechargement.</p>
          )}
        </Card>
        <Card title={`Dossier content/${s.slug}`} actions={s.up_to_date ? <span className="text-xs font-bold text-state-done">À jour</span> : <span className="text-xs font-bold text-state-progress">Différent de la base</span>}>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Version</dt><dd><code>{s.folder.version || "—"}</code></dd>
            <dt className="text-muted">Contenu</dt><dd>{s.folder.stations} stations · {s.folder.questions} questions · {s.folder.media} médias</dd>
          </dl>
          {s.folder.problems.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-sm text-error">{s.folder.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          )}
          {s.folder.warnings.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-sm text-muted">{s.folder.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
        </Card>
      </div>
      <Card title="Actions">
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => setConfirm("reload")} disabled={busy || s.folder.problems.length > 0}>Recharger le contenu</Button>
          <Button onClick={() => setConfirm("freeze")} disabled={busy || !s.loaded || Boolean(s.loaded.tokens_frozen_at)}>Geler les jetons QR</Button>
        </div>
        <p className="mt-3 text-sm text-muted">
          Le rechargement met à jour stations, questions, médias et sous-titres sans toucher aux séances. Une fois les jetons gelés (avant l’impression des affiches), aucun rechargement ne peut plus changer un QR ou un code court.
        </p>
      </Card>
      <ConfirmModal
        open={confirm === "reload"}
        title="Recharger le contenu ?"
        message="Le dossier content/ remplace la version en base. Les éléments retirés sont désactivés, pas supprimés."
        confirmLabel="Recharger"
        busy={busy}
        onConfirm={() => run("reload")}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === "freeze"}
        title="Geler les jetons QR ?"
        message="À faire juste avant d’envoyer les affiches à l’impression. Irréversible depuis la console."
        confirmLabel="Geler"
        busy={busy}
        onConfirm={() => run("freeze")}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
