/** Accès centralisé aux variables d'environnement (voir .env.example). */
export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  get sessionSecret(): string {
    return required("SESSION_SECRET");
  },
  get eventSlug(): string {
    return process.env.EVENT_SLUG ?? "vv26";
  },
  get appBaseUrl(): string {
    return process.env.APP_BASE_URL ?? "http://localhost:3000";
  },
  get mediaBaseUrl(): string {
    return (process.env.MEDIA_BASE_URL ?? "/media").replace(/\/$/, "");
  },
  get participantRatePerMin(): number {
    return Number(process.env.RATE_LIMIT_PARTICIPANT_PER_MIN ?? 120);
  },
  get sessionsPerIpPerMin(): number {
    return Number(process.env.RATE_LIMIT_SESSIONS_PER_IP_PER_MIN ?? 120);
  },
  get maxSessionsPerRun(): number {
    return Number(process.env.MAX_SESSIONS_PER_RUN ?? 2000);
  },
  get retentionMonths(): number {
    return Number(process.env.RETENTION_MONTHS ?? 12);
  },
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable ${name} manquante (voir .env.example)`);
  return v;
}
