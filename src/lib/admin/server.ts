import { cookies } from "next/headers";
import { ADMIN_COOKIE, type AdminUser, getAdminFromCookie } from "./auth";

/** Utilisateur admin connecté, depuis un Server Component ou un layout. */
export async function currentAdmin(): Promise<AdminUser | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return getAdminFromCookie(`${ADMIN_COOKIE}=${token}`);
}

export function serializeAdmin(u: AdminUser) {
  return { ...u, createdAt: u.createdAt.toISOString(), lastLoginAt: u.lastLoginAt?.toISOString() ?? null };
}
