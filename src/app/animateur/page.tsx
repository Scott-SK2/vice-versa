import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { liveRunId } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

/** Raccourci de l'animateur : console de la séance live, onglet Phases. */
export default async function AnimateurPage() {
  const id = await liveRunId(getDb());
  redirect(id ? `/admin/runs/${id}?tab=phases` : "/admin");
}
