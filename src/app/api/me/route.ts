import { z } from "zod";
import { json, parseBody, withApi } from "@/lib/api/http";
import { requireParticipant } from "@/lib/participant/auth";
import { getMe, setLang } from "@/lib/participant/service";

export const dynamic = "force-dynamic";

export const GET = withApi(async (req) => json(await getMe(await requireParticipant(req))));

export const PATCH = withApi(async (req) => {
  const ctx = await requireParticipant(req);
  const body = await parseBody(req, z.object({ lang: z.string().min(2).max(5) }));
  return json(await setLang(ctx, body.lang));
});
