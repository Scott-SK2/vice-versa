"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { adminApi, AdminApiError } from "@/lib/admin/client";
import { Alert, Button, Field, inputClass } from "./ui";

export function PasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setError("Les deux mots de passe diffèrent.");
    setBusy(true);
    setError(null);
    try {
      await adminApi("/api/admin/auth/password", { method: "POST", body: { current_password: current, new_password: next } });
      setDone(true);
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof AdminApiError ? [err.message, ...((err.details?.issues as string[]) ?? [])].join(" ") : "Échec.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {forced && <Alert kind="warning">Ton mot de passe est temporaire : choisis-en un nouveau avant de continuer.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {done && <Alert kind="success">Mot de passe changé.</Alert>}
      <Field label="Mot de passe actuel">
        <input className={inputClass} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <Field label="Nouveau mot de passe" hint="12 caractères minimum.">
        <input className={inputClass} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={12} />
      </Field>
      <Field label="Confirmer">
        <input className={inputClass} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      <Button type="submit" variant="primary" disabled={busy}>Enregistrer</Button>
    </form>
  );
}
