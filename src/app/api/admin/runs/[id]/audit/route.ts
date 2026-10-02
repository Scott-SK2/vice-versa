import { getDb } from "@/db/client";
import { json } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { auditList } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = adminRoute<{ id: string }>("admin", async (_req, { params }) => json({ entries: await auditList(getDb(), (await params).id) }));
