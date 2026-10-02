import type { EventPhase, QuestionPhase } from "@/db/schema/enums";

export const PHASES: readonly EventPhase[] = [
  "accueil",
  "parcours",
  "apres",
  "discussion",
  "trace",
  "cloture",
] as const;

export function phaseIndex(phase: EventPhase): number {
  return PHASES.indexOf(phase);
}

export function nextPhase(phase: EventPhase): EventPhase | null {
  const i = phaseIndex(phase);
  return i >= 0 && i < PHASES.length - 1 ? PHASES[i + 1] : null;
}

/**
 * Un changement de phase est valide s'il avance d'une phase ou recule (avec confirmation).
 * Sauter plusieurs phases en avant est refusé (INVALID_TRANSITION).
 */
export function canTransition(
  from: EventPhase,
  to: EventPhase,
  opts: { confirmBackwards?: boolean } = {},
): { ok: true } | { ok: false; reason: "same" | "skip_forward" | "backwards_needs_confirm" } {
  const a = phaseIndex(from);
  const b = phaseIndex(to);
  if (a === b) return { ok: false, reason: "same" };
  if (b > a + 1) return { ok: false, reason: "skip_forward" };
  if (b < a && !opts.confirmBackwards) return { ok: false, reason: "backwards_needs_confirm" };
  return { ok: true };
}

export type WriteKind = "create_session" | "scan" | QuestionPhase;

/** Matrice des écritures autorisées par phase (02 § 3). */
const MATRIX: Record<WriteKind, readonly EventPhase[]> = {
  create_session: ["accueil", "parcours", "apres", "discussion", "trace"],
  // Le scan reste accepté en discussion / trace mais en lecture seule (voir scanIsReadOnly).
  scan: ["accueil", "parcours", "apres", "discussion", "trace"],
  avant: ["accueil", "parcours", "apres"],
  station: ["parcours", "apres"],
  apres: ["apres", "discussion", "trace"],
  trace: ["discussion", "trace"],
};

export function isWriteAllowed(kind: WriteKind, phase: EventPhase): boolean {
  return MATRIX[kind].includes(phase);
}

/** En discussion et trace, un scan ouvre la station sans créer de visite « en cours ». */
export function scanIsReadOnly(phase: EventPhase): boolean {
  return phase === "discussion" || phase === "trace";
}
