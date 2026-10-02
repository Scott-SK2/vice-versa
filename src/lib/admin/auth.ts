/**
 * Comptes d'administration : mots de passe Argon2id, sessions serveur en cookie
 * httpOnly, rôles hiérarchiques, protection CSRF (06 § 2).
 */
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, schema } from "@/db/client";
import type { AdminRole } from "@/db/schema/enums";
import { errors } from "@/lib/api/errors";
import { clientIp } from "@/lib/api/http";
import { sharedRateLimit } from "@/lib/api/rate-limit";
import { hashToken } from "@/lib/participant/token";

const { adminUsers, adminSessions, auditLog } = schema;
export type AdminUserRow = typeof adminUsers.$inferSelect;
export type AdminUser = Omit<AdminUserRow, "passwordHash">;

export const ADMIN_COOKIE = "vv_admin";
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "vv-admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_MAX_MS = 24 * 60 * 60 * 1000;
const ARGON = { memoryCost: 65536, timeCost: 3, parallelism: 1 };
const ROLE_LEVEL: Record<AdminRole, number> = { moderateur: 1, animateur: 2, admin: 3 };
/** Hachage Argon2id d'un mot de passe aléatoire, calculé une fois, pour une vérification factice à durée identique. */
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hash(randomBytes(32).toString("hex"), ARGON));

export function hasRole(user: Pick<AdminUser, "role">, min: AdminRole): boolean {
  return ROLE_LEVEL[user.role] >= ROLE_LEVEL[min];
}

export const hashPassword = (password: string) => hash(password, ARGON);
export const verifyPassword = (passwordHash: string, password: string) => verify(passwordHash, password, ARGON).catch(() => false);

export function validatePassword(password: string): string | null {
  if (password.length < 12) return "Le mot de passe doit faire au moins 12 caractères.";
  if (/^(password|motdepasse|azertyuiop|123456789012)/i.test(password)) return "Mot de passe trop courant.";
  return null;
}

export function stripUser(u: AdminUserRow): AdminUser {
  const { passwordHash: _ph, ...rest } = u;
  void _ph;
  return rest;
}

/** Crée le premier compte admin depuis l'environnement si la table est vide (06 § 2). */
export async function bootstrapAdminIfEmpty(): Promise<void> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) return;
  const db = getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(adminUsers);
  if (n > 0) return;
  await db
    .insert(adminUsers)
    .values({ email, displayName: "Administrateur", role: "admin", passwordHash: await hashPassword(password), mustChangePassword: true })
    .onConflictDoNothing();
}

export async function login(req: Request, email: string, password: string) {
  const ip = clientIp(req);
  const normalized = email.trim().toLowerCase();
  await sharedRateLimit(`login:${ip}:${normalized}`, 5, 15 * 60 * 1000);
  await sharedRateLimit(`login-email:${normalized}`, 20, 15 * 60 * 1000); // toutes IP confondues
  await sharedRateLimit(`login-ip:${ip}`, 30, 15 * 60 * 1000); // énumération d'e-mails depuis une IP
  await bootstrapAdminIfEmpty();
  const db = getDb();
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, normalized)).limit(1);
  // Vérification factice si le compte n'existe pas : même durée de réponse, pas d'énumération par le temps.
  const verified = user ? await verifyPassword(user.passwordHash, password) : await verifyPassword(await getDummyHash(), password);
  const ok = user && user.active && verified;
  if (!ok) {
    await db.insert(auditLog).values({ actorId: user?.id ?? null, action: "auth.failed", payload: { email: normalized, ip } });
    throw errors.adminUnauthenticated("Identifiants incorrects.");
  }
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await db.insert(adminSessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now + SESSION_TTL_MS),
    ip: ip === "unknown" ? null : ip,
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  await db.update(adminUsers).set({ lastLoginAt: sql`now()` }).where(eq(adminUsers.id, user.id));
  await db.insert(auditLog).values({ actorId: user.id, action: "auth.login", payload: { ip } });
  return { token, user: stripUser(user) };
}

export function sessionCookie(token: string | null): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  if (!token) return `${ADMIN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly${secure}`;
  return `${ADMIN_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_MS / 1000}; SameSite=Lax; HttpOnly${secure}`;
}

export function readAdminCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const m = new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`).exec(cookieHeader);
  return m ? m[1] : null;
}

/** Utilisateur de la session admin portée par le cookie, ou null. Prolonge la session glissante. */
export async function getAdminFromCookie(cookieHeader: string | null): Promise<AdminUser | null> {
  const token = readAdminCookie(cookieHeader);
  if (!token) return null;
  const db = getDb();
  const [row] = await db
    .select({ session: adminSessions, user: adminUsers })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(and(eq(adminSessions.tokenHash, hashToken(token)), gt(adminSessions.expiresAt, sql`now()`)))
    .limit(1);
  if (!row || !row.user.active) return null;
  const now = Date.now();
  const cap = row.session.createdAt.getTime() + SESSION_MAX_MS;
  if (row.session.expiresAt.getTime() - now < SESSION_TTL_MS / 2 && cap > now) {
    await db
      .update(adminSessions)
      .set({ expiresAt: new Date(Math.min(now + SESSION_TTL_MS, cap)) })
      .where(eq(adminSessions.id, row.session.id));
  }
  return stripUser(row.user);
}

export async function logout(cookieHeader: string | null): Promise<void> {
  const token = readAdminCookie(cookieHeader);
  if (!token) return;
  await getDb().delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token)));
}

/**
 * Exige un admin connecté avec au moins le rôle demandé. Les mutations exigent
 * l'en-tête X-Requested-With: vv-admin et, s'il est présent, un Origin du même hôte.
 */
export async function requireAdmin(req: Request, min: AdminRole = "moderateur"): Promise<AdminUser> {
  const user = await getAdminFromCookie(req.headers.get("cookie"));
  if (!user) throw errors.adminUnauthenticated();
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.headers.get(CSRF_HEADER) !== CSRF_VALUE) throw errors.forbidden("En-tête X-Requested-With manquant.");
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) throw errors.forbidden("Origine inattendue.");
  }
  if (!hasRole(user, min)) throw errors.forbidden(`Rôle ${min} requis.`);
  if (user.mustChangePassword && !req.url.includes("/api/admin/auth/")) {
    throw errors.forbidden("Change d’abord ton mot de passe temporaire.");
  }
  return user;
}

export async function changePassword(user: AdminUser, current: string, next: string): Promise<void> {
  const problem = validatePassword(next);
  if (problem) throw errors.validation([problem]);
  const db = getDb();
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(row.passwordHash, current))) throw errors.forbidden("Mot de passe actuel incorrect.");
  await db.update(adminUsers).set({ passwordHash: await hashPassword(next), mustChangePassword: false }).where(eq(adminUsers.id, user.id));
}
