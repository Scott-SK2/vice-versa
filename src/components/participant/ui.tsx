"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "yellow" | "ghost" };

export function Button({ variant = "primary", className = "", ...props }: BtnProps) {
  const v = {
    primary: "bg-green-deep text-paper active:bg-[#0b3d2b]",
    secondary: "border-2 border-green-deep bg-transparent text-green-deep",
    yellow: "bg-yellow text-ink",
    ghost: "text-green-deep underline-offset-4 hover:underline",
  }[variant];
  return (
    <button
      className={`inline-flex min-h-14 w-full items-center justify-center rounded-button px-5 text-base font-bold transition disabled:opacity-50 ${v} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({ href, children, variant = "primary", className = "" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  const v = {
    primary: "bg-green-deep text-paper",
    secondary: "border-2 border-green-deep text-green-deep",
    ghost: "text-green-deep underline-offset-4 hover:underline",
  }[variant];
  return (
    <Link href={href} className={`inline-flex min-h-14 w-full items-center justify-center rounded-button px-5 text-base font-bold ${v} ${className}`}>
      {children}
    </Link>
  );
}

export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-8 pt-5 ${className}`}>{children}</div>;
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header>
      <h1 className="text-3xl leading-tight">{children}</h1>
      {sub && <p className="mt-1 text-muted">{sub}</p>}
    </header>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warning"; children: ReactNode }) {
  const cls = {
    info: "border-here/30 bg-here/5 text-ink",
    error: "border-error/40 bg-error/5 text-error",
    success: "border-state-done/40 bg-state-done/5 text-state-done",
    warning: "border-state-progress/50 bg-state-progress/10 text-ink",
  }[kind];
  return <p className={`rounded-button border px-4 py-3 text-sm ${cls}`} role={kind === "error" ? "alert" : "status"}>{children}</p>;
}

export type StationState = "locked" | "in_progress" | "completed";

/** Pastille d'état d'une station (charte : gris, orange, vert + coche). */
export function Pill({ state, code, here, size = "md" }: { state: StationState; code: string; here?: boolean; size?: "md" | "lg" }) {
  const cls = {
    locked: "bg-state-locked text-state-locked-text",
    in_progress: "bg-state-progress text-state-progress-text",
    completed: "bg-state-done text-white",
  }[state];
  const dim = size === "lg" ? "h-12 w-12 text-lg" : "h-10 w-10 text-base";
  return (
    <span className="relative inline-flex shrink-0">
      <span className={`inline-flex ${dim} items-center justify-center rounded-full font-display font-extrabold ${cls}`} aria-hidden>
        {state === "completed" ? "✓" : code}
      </span>
      {here && <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-paper bg-here animate-pulse motion-reduce:animate-none" aria-hidden />}
    </span>
  );
}

export function Loading({ label }: { label: string }) {
  return <p className="py-10 text-center text-muted" role="status">{label}</p>;
}
