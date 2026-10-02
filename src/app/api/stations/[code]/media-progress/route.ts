import { z } from "zod";
import { json, parseBody, withApi } from "@/lib/api/http";
import { requireParticipant } from "@/lib/participant/auth";
import { mediaProgress } from "@/lib/participant/service";

export const dynamic = "force-dynamic";

const schema = z.object({ media_ref: z.string().min(1), progress: z.number().min(0).max(1) });

export const POST = withApi<{ code: string }>(async (req, { params }) => {
  const ctx = await requireParticipant(req);
  const { code } = await params;
  const body = await parseBody(req, schema);
  return json(await mediaProgress(ctx, code, { mediaRef: body.media_ref, progress: body.progress }));
});
