import { z } from "zod";
import { json, parseBody, withApi } from "@/lib/api/http";
import { requireParticipant } from "@/lib/participant/auth";
import { putAnswer } from "@/lib/participant/service";

export const dynamic = "force-dynamic";

const schema = z.object({ value: z.unknown(), client_ts: z.string().datetime({ offset: true }).optional() });

/** Crée ou remplace la réponse ; recalcule l'état de la station. */
export const PUT = withApi<{ key: string }>(async (req, { params }) => {
  const ctx = await requireParticipant(req);
  const { key } = await params;
  const body = await parseBody(req, schema);
  return json(await putAnswer(ctx, key, { value: body.value, clientTs: body.client_ts }));
});
