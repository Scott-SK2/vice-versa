import { z } from "zod";
import { getDb } from "@/db/client";
import { json, parseBody } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { updateUser } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  role: z.enum(["admin", "animateur", "moderateur"]).optional(),
  active: z.boolean().optional(),
  display_name: z.string().trim().min(1).max(80).optional(),
  temporary_password: z.string().min(1).optional(),
});

export const PATCH = adminRoute<{ id: string }>("admin", async (req, { params }, user) => {
  const { id } = await params;
  const b = await parseBody(req, schema);
  return json({ user: await updateUser(getDb(), user, id, { role: b.role, active: b.active, displayName: b.display_name, temporaryPassword: b.temporary_password }) });
});
