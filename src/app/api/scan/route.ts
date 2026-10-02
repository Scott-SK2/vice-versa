import { json, parseBody, withApi } from "@/lib/api/http";
import { requireParticipant } from "@/lib/participant/auth";
import { scanSchema } from "@/lib/participant/schemas";
import { scan } from "@/lib/participant/service";

export const dynamic = "force-dynamic";

/** Scan par jeton QR ou code court ; la station est résolue côté serveur. */
export const POST = withApi(async (req) => {
  const ctx = await requireParticipant(req);
  const body = await parseBody(req, scanSchema);
  return json(await scan(ctx, { token: body.token, shortCode: body.short_code }));
});
