"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { adminApi } from "@/lib/admin/client";
import { useAdminUser } from "./AdminUserContext";
import { Button } from "./ui";
import { can } from "./types";

export function AdminShell({ children, liveRunId }: { children: React.ReactNode; liveRunId: string | null }) {
  const user = useAdminUser();
  const path = usePathname();
  const router = useRouter();
  const nav = [
    { href: "/admin", label: "Séances", show: true },
    { href: liveRunId ? `/admin/runs/${liveRunId}` : "/admin", label: "Séance en cours", show: Boolean(liveRunId) },
    { href: "/admin/users", label: "Comptes", show: can(user, "admin") },
    { href: "/admin/content", label: "Contenu", show: can(user, "admin") },
  ].filter((n) => n.show);

  async function logout() {
    await adminApi("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-state-locked bg-green-deep text-paper">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-display text-lg font-extrabold tracking-tight">VICE VERSA · Console</Link>
            <nav className="flex gap-1" aria-label="Navigation">
              {nav.map((n) => (
                <Link
                  key={n.label}
                  href={n.href}
                  className={`rounded-button px-3 py-1.5 text-sm font-semibold ${path === n.href || (n.href !== "/admin" && path.startsWith(n.href)) ? "bg-paper text-green-deep" : "hover:bg-white/10"}`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span>
              {user.displayName} <span className="opacity-70">· {user.role}</span>
            </span>
            <Link href="/admin/password" className="underline-offset-2 hover:underline">Mot de passe</Link>
            <Button size="sm" variant="ghost" className="text-paper hover:bg-white/10" onClick={logout}>Se déconnecter</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
