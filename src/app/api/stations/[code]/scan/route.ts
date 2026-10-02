import { json, parseBody, withApi } from "@/lib/api/http";
import { requireParticipant } from "@/lib/participant/auth";
import { scanSchema } from "@/lib/participant/schemas";
import { scan } from "@/lib/participant/service";

export const dynamic = "force-dynamic";

/** Variante du cahier : le code de la station est dans l'URL et doit correspondre au jeton. */
export const POST = withApi<{ code: string }>(async (req, { params }) => {
  const ctx = await requireParticipant(req);
  const { code } = await params;
  const body = await parseBody(req, scanSchema);
  return json(await scan(ctx, { token: body.token, shortCode: body.short_code, expectedCode: code }));
});
