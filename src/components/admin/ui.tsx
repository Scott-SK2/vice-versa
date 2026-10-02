"use client";

import { type ReactNode, useState } from "react";
import type { Phase, RunKind, RunStatus } from "./types";
import { KIND_LABEL, PHASES, STATUS_LABEL } from "./types";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "md" | "sm" };

export function Button({ variant = "secondary", size = "md", className = "", ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-button font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = size === "sm" ? "min-h-9 px-3 text-sm" : "min-h-11 px-4 text-sm";
  const variants = {
    primary: "bg-green-deep text-paper hover:bg-[#0b3d2b]",
    secondary: "border border-state-locked bg-white text-ink hover:bg-paper",
    danger: "bg-error text-white hover:bg-[#7e2210]",
    ghost: "text-ink hover:bg-paper",
  }[variant];
  return <button className={`${base} ${sizes} ${variants} ${className}`} {...props} />;
}

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border border-state-locked bg-white p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="text-lg">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warning"; children: ReactNode }) {
  const styles = {
    info: "border-here/30 bg-here/5 text-ink",
    error: "border-error/40 bg-error/5 text-error",
    success: "border-state-done/40 bg-state-done/5 text-state-done",
    warning: "border-state-progress/50 bg-state-progress/10 text-ink",
  }[kind];
  return <div className={`rounded-button border px-4 py-3 text-sm ${styles}`} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass = "block w-full min-h-11 rounded-button border border-state-locked bg-white px-3 text-base text-ink focus:border-green-deep focus:outline-none focus:ring-2 focus:ring-green-deep/30";

export function KindBadge({ kind }: { kind: RunKind }) {
  const cls = { test: "bg-state-locked text-state-locked-text", repetition: "bg-here/15 text-here", live: "bg-yellow text-ink" }[kind];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${cls}`}>{KIND_LABEL[kind]}</span>;
}

export function StatusBadge({ status }: { status: RunStatus }) {
  const cls = {
    draft: "bg-state-locked text-state-locked-text",
    live: "bg-state-done text-white",
    closed: "bg-ink/80 text-paper",
    archived: "bg-state-locked text-muted",
  }[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{STATUS_LABEL[status]}</span>;
}

export function PhaseBadge({ phase }: { phase: Phase }) {
  return <span className="rounded-full border border-state-locked px-2.5 py-0.5 text-xs font-semibold">{PHASES.find((p) => p.key === phase)?.label ?? phase}</span>;
}

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return <p className="text-sm text-muted" role="status">{label}</p>;
}

/** Boîte de confirmation ; avec `typed`, l'utilisateur doit recopier ce texte. */
export function ConfirmModal({
  open,
  title,
  message,
  typed,
  confirmLabel = "Confirmer",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  typed?: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  if (!open) return null;
  const ok = !typed || value.trim() === typed;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-full max-w-md rounded-card bg-white p-6 shadow-xl">
        <h2 id="confirm-title" className="text-xl">{title}</h2>
        <div className="mt-3 text-sm text-ink">{message}</div>
        {typed && (
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-muted">Recopie « {typed} » pour confirmer</span>
            <input className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>Annuler</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); setValue(""); }} disabled={!ok || busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Barre horizontale simple (fréquentation, résultats). */
export function Bar({ value, max, label, sublabel, color = "bg-green-deep" }: { value: number; max: number; label: string; sublabel?: string; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="text-sm">
      <div className="mb-1 flex justify-between gap-2">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 text-muted">{sublabel ?? value}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-state-locked/60" aria-hidden>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
