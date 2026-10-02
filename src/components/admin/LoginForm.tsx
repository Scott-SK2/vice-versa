"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { adminApi, AdminApiError } from "@/lib/admin/client";
import type { AdminUserDto } from "./types";
import { Alert, Button, Field, inputClass } from "./ui";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await adminApi<{ user: AdminUserDto }>("/api/admin/auth/login", { method: "POST", body: { email, password } });
      router.push(user.mustChangePassword ? "/admin/password" : (params.get("next") ?? "/admin"));
      router.refresh();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert kind="error">{error}</Alert>}
      <Field label="E-mail">
        <input className={inputClass} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Mot de passe">
        <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Button type="submit" variant="primary" disabled={busy} className="min-h-13">
        {busy ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
