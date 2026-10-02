/**
 * Comptes d'administration et journal d'audit.
 * Référence : docs/conception/03-modele-de-donnees.md § 4 et 06.
 */
import { boolean, index, inet, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { adminRole } from "./enums";

export const adminUsers = pgTable("admin_users", {
  id: uuid().primaryKey().defaultRandom(),
  /** Toujours stocké en minuscules (normalisé par l'application). */
  email: text().notNull().unique(),
  displayName: text().notNull(),
  /** Argon2id */
  passwordHash: text().notNull(),
  role: adminRole().notNull(),
  active: boolean().notNull().default(true),
  mustChangePassword: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp({ withTimezone: true }),
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    /** sha256 (hexadécimal) du cookie vv_admin. */
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ip: inet(),
    userAgent: text(),
  },
  (t) => [index("admin_sessions_user_idx").on(t.userId)],
);
