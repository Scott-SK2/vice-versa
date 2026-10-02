export type StationState = "locked" | "in_progress" | "completed";

export type StationProgressInput = {
  code: string;
  countsInProgress: boolean;
  state: StationState;
};

/**
 * Progression = stations terminées ÷ stations requises × 100, arrondi à l'entier.
 * L'accueil (A) et la clôture (Z) ne comptent pas.
 */
export function computeProgress(
  stations: readonly StationProgressInput[],
  requiredStations: number,
): { completed: number; required: number; percent: number } {
  const completed = stations.filter((s) => s.countsInProgress && s.state === "completed").length;
  const required = Math.max(1, requiredStations);
  return { completed, required, percent: Math.round((completed / required) * 100) };
}

export const MEDIA_ONLY_COMPLETION_THRESHOLD = 0.8;

/** Une station media_only est terminée quand le média est lu à 80 %. */
export function isMediaOnlyCompleted(progress: number): boolean {
  return progress >= MEDIA_ONLY_COMPLETION_THRESHOLD;
}
