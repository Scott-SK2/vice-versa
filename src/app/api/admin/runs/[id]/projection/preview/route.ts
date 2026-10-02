import { getDb } from "@/db/client";
import { errors } from "@/lib/api/errors";
import { json } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { slideSchema } from "@/lib/admin/schemas";
import { getRunOrThrow, projectionData } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

/** Aperçu des données d'une diapositive : ?kind=before_after&question=avant_futur */
export const GET = adminRoute<{ id: string }>("moderateur", async (req, { params }) => {
  const run = await getRunOrThrow(getDb(), (await params).id);
  const sp = new URL(req.url).searchParams;
  const parsed = slideSchema.safeParse({ kind: sp.get("kind"), questionKey: sp.get("question") ?? undefined });
  if (!parsed.success) throw errors.validation(["kind ou question invalide"]);
  return json(await projectionData(getDb(), run, parsed.data));
});
