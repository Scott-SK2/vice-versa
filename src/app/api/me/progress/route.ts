import { json, withApi } from "@/lib/api/http";
import { requireParticipant } from "@/lib/participant/auth";
import { getProgress } from "@/lib/participant/service";

export const dynamic = "force-dynamic";

export const GET = withApi(async (req) => json(await getProgress(await requireParticipant(req))));
