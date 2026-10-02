import { z } from "zod";
import { json, parseBody, withApi } from "@/lib/api/http";
import { login, sessionCookie } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export const POST = withApi(async (req) => {
  const body = await parseBody(req, z.object({ email: z.string().email(), password: z.string().min(1) }));
  const { token, user } = await login(req, body.email, body.password);
  return json({ user }, { headers: { "Set-Cookie": sessionCookie(token) } });
});
