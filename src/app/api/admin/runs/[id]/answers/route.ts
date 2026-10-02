import { z } from "zod";
import { getDb } from "@/db/client";
import { json } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { moderationList } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

const q = z.object({
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = adminRoute<{ id: string }>("moderateur", async (req, { params }) => {
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const opts = q.parse({ status: sp.get("status") ?? undefined, before: sp.get("before") ?? undefined, limit: sp.get("limit") ?? undefined });
  return json(await moderationList(getDb(), id, opts));
});
