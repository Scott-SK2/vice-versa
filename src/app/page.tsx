import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">VICE VERSA</p>
      <h1 className="text-4xl leading-tight">Deux regards, deux continents</h1>
      <p className="text-muted">
        L’application est en cours de construction. Le parcours participant s’ouvrira sur{" "}
        <code className="rounded bg-state-locked px-1 py-0.5 text-sm text-ink">/vv26</code> et la console
        d’administration sur <code className="rounded bg-state-locked px-1 py-0.5 text-sm text-ink">/admin</code>.
      </p>
      <Link
        href="/vv26"
        className="inline-flex min-h-14 items-center justify-center rounded-button bg-green-deep px-6 text-base font-bold text-paper"
      >
        Commencer
      </Link>
    </main>
  );
}
