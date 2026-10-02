/**
 * Tâches de rétention (03 § 7) : archivage des séances clôturées depuis plus de
 * RETENTION_MONTHS mois (données participants supprimées, résumé conservé),
 * purge des sessions admin expirées et du journal de plus de 24 mois.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { type Db, schema } from "@/db/client";
import { env } from "@/lib/env";

const { runs, participantSessions, adminSessions, auditLog } = schema;

export type MaintenanceReport = { archivedRuns: number; expiredAdminSessions: number; prunedAuditRows: number };

export async function runMaintenance(db: Db, now = new Date()): Promise<MaintenanceReport> {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - env.retentionMonths);
  const auditCutoff = new Date(now);
  auditCutoff.setMonth(auditCutoff.getMonth() - 24);

  const archivedRuns = await db.transaction(async (tx) => {
    const old = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.status, "closed"), lt(runs.closedAt, cutoff)));
    for (const r of old) {
      await tx.delete(participantSessions).where(eq(participantSessions.runId, r.id));
      await tx.update(runs).set({ status: "archived", updatedAt: sql`now()` }).where(eq(runs.id, r.id));
      await tx.insert(auditLog).values({ runId: r.id, action: "run.archive", payload: { automatic: true, retention_months: env.retentionMonths } });
    }
    return old.length;
  });

  const expired = await db.delete(adminSessions).where(lt(adminSessions.expiresAt, now)).returning({ id: adminSessions.id });
  const pruned = await db.delete(auditLog).where(lt(auditLog.at, auditCutoff)).returning({ id: auditLog.id });
  return { archivedRuns, expiredAdminSessions: expired.length, prunedAuditRows: pruned.length };
}
