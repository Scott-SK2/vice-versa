import { json, withApi } from "@/lib/api/http";
import { logout, sessionCookie } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export const POST = withApi(async (req) => {
  await logout(req.headers.get("cookie"));
  return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(null) } });
});
