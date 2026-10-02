import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

/** Empreinte HMAC-SHA256 d'un jeton (participant ou admin) : la base ne stocke jamais le jeton. */
export function hashToken(token: string): string {
  return createHmac("sha256", env.sessionSecret).update(token).digest("hex");
}
