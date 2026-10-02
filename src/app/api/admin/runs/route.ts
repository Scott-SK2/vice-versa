import { z } from "zod";
import { getDb } from "@/db/client";
import { json, parseBody } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { getRunDetail, listRuns } from "@/lib/admin/service";
import { env } from "@/lib/env";
import { createRun } from "@/lib/runs/service";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["draft", "live", "closed", "archived"]).optional();

export const GET = adminRoute("moderateur", async (req) => {
  const status = statusSchema.parse(new URL(req.url).searchParams.get("status") ?? undefined);
  return json({ runs: await listRuns(getDb(), { status }) });
});

const createSchema = z.object({
  label: z.string().trim().min(1).max(120),
  kind: z.enum(["test", "repetition", "live"]).default("test"),
  scheduled_at: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const POST = adminRoute("admin", async (req, _ctx, user) => {
  const body = await parseBody(req, createSchema);
  const run = await createRun(getDb(), user, {
    eventSlug: env.eventSlug,
    label: body.label,
    kind: body.kind,
    scheduledAt: body.scheduled_at ? new Date(body.scheduled_at) : null,
    notes: body.notes ?? null,
  });
  return json({ run: await getRunDetail(getDb(), run.id) }, { status: 201 });
});
