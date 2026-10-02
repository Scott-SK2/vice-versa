import { z } from "zod";
import { errors } from "@/lib/api/errors";
import { json, withApi } from "@/lib/api/http";
import { requireParticipant } from "@/lib/participant/auth";
import { listQuestions } from "@/lib/participant/service";

export const dynamic = "force-dynamic";

const phaseSchema = z.enum(["avant", "apres", "trace"]);

/** Questions d'une phase hors station : ?phase=avant|apres|trace */
export const GET = withApi(async (req) => {
  const ctx = await requireParticipant(req);
  const parsed = phaseSchema.safeParse(new URL(req.url).searchParams.get("phase"));
  if (!parsed.success) throw errors.validation(["phase doit être avant, apres ou trace"]);
  return json(await listQuestions(ctx, parsed.data));
});
