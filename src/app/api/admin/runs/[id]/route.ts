import { z } from "zod";
import { getDb } from "@/db/client";
import { json, parseBody } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { getRunDetail, updateRun } from "@/lib/admin/service";
import { deleteRun } from "@/lib/runs/service";

export const dynamic = "force-dynamic";
type P = { id: string };

export const GET = adminRoute<P>("moderateur", async (_req, { params }) => json({ run: await getRunDetail(getDb(), (await params).id) }));

const patchSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(["test", "repetition", "live"]).optional(),
  scheduled_at: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const PATCH = adminRoute<P>("admin", async (req, { params }, user) => {
  const { id } = await params;
  const body = await parseBody(req, patchSchema);
  const run = await updateRun(getDb(), user, id, {
    label: body.label,
    kind: body.kind,
    scheduledAt: body.scheduled_at === undefined ? undefined : body.scheduled_at ? new Date(body.scheduled_at) : null,
    notes: body.notes,
  });
  return json({ run });
});

export const DELETE = adminRoute<P>("admin", async (_req, { params }, user) => {
  await deleteRun(getDb(), user, (await params).id);
  return json({ ok: true });
});
