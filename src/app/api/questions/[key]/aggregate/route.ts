import { json, withApi } from "@/lib/api/http";
import { requireParticipant } from "@/lib/participant/auth";
import { getAggregate } from "@/lib/participant/service";

export const dynamic = "force-dynamic";

export const GET = withApi<{ key: string }>(async (req, { params }) => {
  const ctx = await requireParticipant(req);
  const { key } = await params;
  return json(await getAggregate(ctx, key));
});
