import type { AdminRole } from "@/db/schema/enums";
import { withApi } from "@/lib/api/http";
import { type AdminUser, requireAdmin } from "./auth";

type Ctx<P> = { params: Promise<P> };

/** Route Handler admin : authentification, rôle minimal, CSRF, erreurs JSON. */
export function adminRoute<P = Record<string, never>>(
  min: AdminRole,
  handler: (req: Request, ctx: Ctx<P>, user: AdminUser) => Promise<Response>,
) {
  return withApi<P>(async (req, ctx) => handler(req, ctx, await requireAdmin(req, min)));
}
