import { getDb } from "@/db/client";
import { adminRoute } from "@/lib/admin/route";
import { exportCsv, getRunOrThrow } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = adminRoute<{ id: string }>("admin", async (_req, { params }, user) => {
  const { id } = await params;
  const run = await getRunOrThrow(getDb(), id);
  const csv = await exportCsv(getDb(), user, id);
  const name = `vice-versa_${run.label.replace(/[^\w-]+/g, "_")}_${id.slice(0, 8)}.csv`;
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
});
