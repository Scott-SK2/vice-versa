import { Suspense } from "react";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata = { title: "Connexion — Console VICE VERSA" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">VICE VERSA</p>
        <h1 className="text-3xl">Console d’animation</h1>
        <p className="mt-2 text-sm text-muted">Accès réservé aux comptes admin, animateur et modérateur.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
