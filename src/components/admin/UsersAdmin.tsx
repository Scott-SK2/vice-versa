"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { adminApi, AdminApiError, fmtDate } from "@/lib/admin/client";
import { useAdminUser } from "./AdminUserContext";
import type { AdminUserDto, Role } from "./types";
import { Alert, Button, Card, Field, inputClass, Spinner } from "./ui";

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", animateur: "Animateur", moderateur: "Modérateur" };

function tempPassword() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => a[b % a.length]).join("");
}

export function UsersAdmin() {
  const me = useAdminUser();
  const [users, setUsers] = useState<AdminUserDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", display_name: "", role: "animateur" as Role, temporary_password: tempPassword() });

  const load = useCallback(() => {
    adminApi<{ users: AdminUserDto[] }>("/api/admin/users")
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, []);
  useEffect(load, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await adminApi("/api/admin/users", { method: "POST", body: form });
      setNotice(`Compte créé pour ${form.email}. Mot de passe temporaire à transmettre (affiché une seule fois) : ${form.temporary_password}`);
      setForm({ email: "", display_name: "", role: "animateur", temporary_password: tempPassword() });
      load();
    } catch (err) {
      setError(err instanceof AdminApiError ? [err.message, ...((err.details?.issues as string[]) ?? [])].join(" ") : "Erreur");
    }
  }

  async function patch(id: string, body: Record<string, unknown>, message?: string) {
    setError(null);
    try {
      await adminApi(`/api/admin/users/${id}`, { method: "PATCH", body });
      if (message) setNotice(message);
      load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Erreur");
    }
  }

  function resetPassword(u: AdminUserDto) {
    const pw = tempPassword();
    if (!confirm(`Réinitialiser le mot de passe de ${u.email} ? Ses sessions seront fermées.`)) return;
    patch(u.id, { temporary_password: pw }, `Nouveau mot de passe temporaire pour ${u.email} (affiché une seule fois) : ${pw}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Comptes</h1>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      <Card title="Comptes existants">
        {!users && <Spinner />}
        {users && (
          <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2">Nom</th>
                <th>E-mail</th>
                <th>Rôle</th>
                <th>État</th>
                <th>Dernière connexion</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-state-locked/70">
                  <td className="py-3 font-semibold">
                    {u.displayName}
                    {u.id === me.id && <span className="ml-2 text-xs text-muted">(toi)</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <select className="rounded-button border border-state-locked bg-white px-2 py-1" value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>
                      {(["admin", "animateur", "moderateur"] as Role[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {u.active ? <span className="text-state-done">actif</span> : <span className="text-muted">désactivé</span>}
                    {u.mustChangePassword && <span className="ml-2 text-xs text-state-progress">mot de passe temporaire</span>}
                  </td>
                  <td className="text-muted">{fmtDate(u.lastLoginAt)}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => resetPassword(u)}>Réinitialiser le mot de passe</Button>
                      {u.id !== me.id && (
                        <Button size="sm" variant={u.active ? "danger" : "secondary"} onClick={() => patch(u.id, { active: !u.active })}>
                          {u.active ? "Désactiver" : "Réactiver"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Nouveau compte">
        <form onSubmit={create} className="grid gap-4 md:grid-cols-2">
          <Field label="Nom affiché">
            <input className={inputClass} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required />
          </Field>
          <Field label="E-mail">
            <input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Rôle" hint="Admin : tout. Animateur : phases, projection, modération. Modérateur : modération.">
            <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {(["admin", "animateur", "moderateur"] as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </Field>
          <Field label="Mot de passe temporaire" hint="À transmettre à la personne ; elle devra le changer à la première connexion.">
            <input className={inputClass} value={form.temporary_password} onChange={(e) => setForm({ ...form, temporary_password: e.target.value })} minLength={12} required />
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" variant="primary">Créer le compte</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
