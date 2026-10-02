import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { liveRunId } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

/** Raccourci du modérateur : console de la séance live, onglet Modération. */
export default async function ModerationPage() {
  const id = await liveRunId(getDb());
  redirect(id ? `/admin/runs/${id}?tab=moderation` : "/admin");
}
