"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { adminApi, AdminApiError } from "@/lib/admin/client";
import type { RunDto, RunKind } from "./types";
import { Alert, Button, Card, ConfirmModal, Field, inputClass } from "./ui";

export function NewRunForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<RunKind>("test");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { run } = await adminApi<{ run: RunDto }>("/api/admin/runs", {
        method: "POST",
        body: { label, kind, scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null, notes: notes || null },
      });
      router.push(`/admin/runs/${run.id}`);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Création impossible.");
    } finally {
      setBusy(false);
      setConfirmLive(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (kind === "live") setConfirmLive(true);
    else create();
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Libellé" hint="Ex. « Test interne 1 », « Répétition générale 9 oct », « Atelier 10 octobre »">
          <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={120} />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as RunKind)}>
            <option value="test">Test — bandeau « séance de test », réinitialisable, supprimable</option>
            <option value="repetition">Répétition — comme un test, sans bandeau</option>
            <option value="live">Live — l’événement réel</option>
          </select>
        </Field>
        <Field label="Date prévue (facultatif)">
          <input className={inputClass} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </Field>
        <Field label="Notes (facultatif)">
          <textarea className={`${inputClass} min-h-24 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={() => router.push("/admin")}>Annuler</Button>
          <Button type="submit" variant="primary" disabled={busy}>Créer en brouillon</Button>
        </div>
      </form>
      <ConfirmModal
        open={confirmLive}
        title="Séance Live"
        message="Il s’agit de l’événement réel : pas de bandeau de test, pas de réouverture après clôture, réinitialisation impossible dès qu’il y a des participants."
        confirmLabel="Créer la séance Live"
        busy={busy}
        onConfirm={create}
        onCancel={() => setConfirmLive(false)}
      />
    </Card>
  );
}
