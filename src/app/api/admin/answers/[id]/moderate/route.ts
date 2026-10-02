import { z } from "zod";
import { getDb } from "@/db/client";
import { errors } from "@/lib/api/errors";
import { json, parseBody } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { moderate } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>("moderateur", async (req, { params }, user) => {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) throw errors.notFound("Réponse");
  const body = await parseBody(req, z.object({ decision: z.enum(["approved", "rejected"]) }));
  return json(await moderate(getDb(), user, id, body.decision));
});
