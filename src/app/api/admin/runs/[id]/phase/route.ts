import { z } from "zod";
import { getDb } from "@/db/client";
import { json, parseBody } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { getRunDetail } from "@/lib/admin/service";
import { setPhase } from "@/lib/runs/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  phase: z.enum(["accueil", "parcours", "apres", "discussion", "trace", "cloture"]),
  confirm_backwards: z.boolean().optional(),
});

export const POST = adminRoute<{ id: string }>("animateur", async (req, { params }, user) => {
  const { id } = await params;
  const body = await parseBody(req, schema);
  await setPhase(getDb(), user, id, body.phase, { confirmBackwards: body.confirm_backwards });
  return json({ run: await getRunDetail(getDb(), id) });
});
