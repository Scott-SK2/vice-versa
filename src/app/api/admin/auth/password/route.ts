import { z } from "zod";
import { json, parseBody } from "@/lib/api/http";
import { changePassword } from "@/lib/admin/auth";
import { adminRoute } from "@/lib/admin/route";

export const dynamic = "force-dynamic";

export const POST = adminRoute("moderateur", async (req, _ctx, user) => {
  const body = await parseBody(req, z.object({ current_password: z.string().min(1), new_password: z.string().min(1) }));
  await changePassword(user, body.current_password, body.new_password);
  return json({ ok: true });
});
