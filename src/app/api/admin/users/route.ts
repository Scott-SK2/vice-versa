import { z } from "zod";
import { getDb } from "@/db/client";
import { json, parseBody } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { createUser, listUsers } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = adminRoute("admin", async () => json({ users: await listUsers(getDb()) }));

const schema = z.object({
  email: z.string().email(),
  display_name: z.string().trim().min(1).max(80),
  role: z.enum(["admin", "animateur", "moderateur"]),
  temporary_password: z.string().min(1),
});

export const POST = adminRoute("admin", async (req, _ctx, user) => {
  const b = await parseBody(req, schema);
  const created = await createUser(getDb(), user, { email: b.email, displayName: b.display_name, role: b.role, temporaryPassword: b.temporary_password });
  return json({ user: created }, { status: 201 });
});
