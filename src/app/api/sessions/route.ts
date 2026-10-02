import { z } from "zod";
import { clientIp, json, parseBody, withApi } from "@/lib/api/http";
import { createSession } from "@/lib/participant/service";

export const dynamic = "force-dynamic";

const schema = z.object({ lang: z.string().min(2).max(5).default("fr") });

/** Crée la session anonyme sur la séance live et renvoie le jeton. */
export const POST = withApi(async (req) => {
  const body = await parseBody(req, schema);
  const result = await createSession({ lang: body.lang, ip: clientIp(req) });
  const maxAge = 60 * 60 * 24 * 30;
  return json(result, {
    status: 201,
    headers: {
      "Set-Cookie": `vv_session=${encodeURIComponent(result.token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    },
  });
});
