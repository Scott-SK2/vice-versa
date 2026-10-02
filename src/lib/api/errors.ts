/** Format d'erreur commun (04 § 1). */
export type ApiErrorCode =
  | "VALIDATION"
  | "BANNED_WORD"
  | "SESSION_UNKNOWN"
  | "ADMIN_UNAUTHENTICATED"
  | "FORBIDDEN"
  | "STATION_LOCKED"
  | "NOT_FOUND"
  | "UNKNOWN_CODE"
  | "RUN_CHANGED"
  | "RUN_CLOSED"
  | "NO_RUN_LIVE"
  | "ANOTHER_RUN_LIVE"
  | "INVALID_TRANSITION"
  | "PHASE_LOCKED"
  | "RATE_LIMITED"
  | "INTERNAL";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) } };
  }
}

export const errors = {
  validation: (issues: string[]) => new ApiError(400, "VALIDATION", "Données invalides.", { issues }),
  bannedWord: (words: string[]) =>
    new ApiError(400, "BANNED_WORD", "Certains mots ne peuvent pas être affichés.", { words }),
  sessionUnknown: () => new ApiError(401, "SESSION_UNKNOWN", "Session inconnue."),
  stationLocked: () =>
    new ApiError(403, "STATION_LOCKED", "Rends-toi à la station pour la découvrir."),
  forbidden: (message = "Action non autorisée.") => new ApiError(403, "FORBIDDEN", message),
  notFound: (what = "Ressource") => new ApiError(404, "NOT_FOUND", `${what} introuvable.`),
  unknownCode: () => new ApiError(404, "UNKNOWN_CODE", "Code inconnu."),
  runChanged: (newRunId: string) =>
    new ApiError(409, "RUN_CHANGED", "Un nouvel atelier a commencé.", { run_id: newRunId }),
  runClosed: () => new ApiError(409, "RUN_CLOSED", "L’atelier est terminé."),
  noRunLive: () => new ApiError(409, "NO_RUN_LIVE", "Aucun atelier en cours."),
  anotherRunLive: (label: string, runId: string) =>
    new ApiError(409, "ANOTHER_RUN_LIVE", `La séance « ${label} » est déjà en cours.`, { run_id: runId, label }),
  invalidTransition: (reason: string) =>
    new ApiError(409, "INVALID_TRANSITION", "Changement de phase refusé.", { reason }),
  phaseLocked: (phase: string) =>
    new ApiError(423, "PHASE_LOCKED", "Cette étape est fermée.", { phase }),
  rateLimited: (retryAfterS: number) =>
    new ApiError(429, "RATE_LIMITED", "Trop de requêtes.", { retry_after: retryAfterS }, { "Retry-After": String(retryAfterS) }),
};
