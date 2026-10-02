import { getDb } from "@/db/client";
import { json, parseBody } from "@/lib/api/http";
import { adminRoute } from "@/lib/admin/route";
import { slideSchema } from "@/lib/admin/schemas";
import { availableSlides, getRunOrThrow, setSlide } from "@/lib/admin/service";
import { getCatalogBySlug } from "@/lib/content/catalog";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
type P = { id: string };

/** Diapositives disponibles et diapositive courante. */
export const GET = adminRoute<P>("moderateur", async (_req, { params }) => {
  const run = await getRunOrThrow(getDb(), (await params).id);
  const catalog = await getCatalogBySlug(env.eventSlug);
  return json({
    current_slide: run.currentSlide ?? { kind: "blank" },
    slides: catalog ? availableSlides(catalog) : [],
    projection_url: `${env.appBaseUrl}/projection/${run.id}?key=${run.projectionKey}`,
  });
});

export const PUT = adminRoute<P>("animateur", async (req, { params }, user) => {
  const { id } = await params;
  const slide = await parseBody(req, slideSchema);
  return json(await setSlide(getDb(), user, id, slide));
});
