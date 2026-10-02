export type Role = "admin" | "animateur" | "moderateur";
export type RunKind = "test" | "repetition" | "live";
export type RunStatus = "draft" | "live" | "closed" | "archived";
export type Phase = "accueil" | "parcours" | "apres" | "discussion" | "trace" | "cloture";

export type AdminUserDto = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export type RunDto = {
  id: string;
  event: string;
  label: string;
  kind: RunKind;
  status: RunStatus;
  phase: Phase;
  notes: string | null;
  scheduled_at: string | null;
  created_at: string;
  created_by: string | null;
  started_at: string | null;
  started_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  projection_key: string;
  current_slide: Slide | null;
  has_summary: boolean;
  sessions: number;
  active_sessions: number;
};

export type Slide =
  | { kind: "blank" }
  | { kind: "overview" }
  | { kind: "before_after"; questionKey: string }
  | { kind: "tri_state_columns"; questionKey: string }
  | { kind: "words"; questionKey: string }
  | { kind: "approved_texts"; questionKey: string };

export const PHASES: { key: Phase; label: string; duration: string; participant: string; animateur: string }[] = [
  { key: "accueil", label: "Accueil", duration: "10 min", participant: "QR d’entrée, langue, 3 questions « Avant »", animateur: "Voit le nombre de sessions monter" },
  { key: "parcours", label: "Parcours", duration: "25–30 min", participant: "Scan des stations, médias, réponses, carte", animateur: "Suit la progression moyenne" },
  { key: "apres", label: "Après", duration: "5 min", participant: "Questions « Après » débloquées pour tous", animateur: "Voit les réponses « Après » arriver" },
  { key: "discussion", label: "Discussion", duration: "35–40 min", participant: "« Merci, place à la discussion », stations en lecture seule", animateur: "Projette les résultats agrégés" },
  { key: "trace", label: "Trace finale", duration: "5–10 min", participant: "« Après VICE VERSA, je repars avec… »", animateur: "Modère puis projette une sélection" },
  { key: "cloture", label: "Clôture", duration: "—", participant: "Écran de remerciement, plus aucune saisie", animateur: "Stopper la séance, exporter" },
];

export const ROLE_LEVEL: Record<Role, number> = { moderateur: 1, animateur: 2, admin: 3 };
export const can = (user: { role: Role } | null | undefined, min: Role) => Boolean(user && ROLE_LEVEL[user.role] >= ROLE_LEVEL[min]);

export const KIND_LABEL: Record<RunKind, string> = { test: "Test", repetition: "Répétition", live: "Live" };
export const STATUS_LABEL: Record<RunStatus, string> = { draft: "Brouillon", live: "En cours", closed: "Clôturée", archived: "Archivée" };
