import { json, withApi } from "@/lib/api/http";
import { requireParticipant } from "@/lib/participant/auth";
import { getStation } from "@/lib/participant/service";

export const dynamic = "force-dynamic";

/** Contenu d'une station débloquée : médias, sous-titres, questions, réponses déjà données. */
export const GET = withApi<{ code: string }>(async (req, { params }) => {
  const ctx = await requireParticipant(req);
  const { code } = await params;
  return json(await getStation(ctx, code));
});
