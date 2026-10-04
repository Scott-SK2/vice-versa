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
export const GET = adminRoute<P>("moderateur", async (req, { params }) => {
  const run = await getRunOrThrow(getDb(), (await params).id);
  const catalog = await getCatalogBySlug(env.eventSlug);
  return json({
    current_slide: run.currentSlide ?? { kind: "blank" },
    slides: catalog ? availableSlides(catalog) : [],
    projection_url: `${publicOrigin(req)}/projection/${run.id}?key=${run.projectionKey}`,
  });
});

/** APP_BASE_URL si définie, sinon l'origine de la requête telle que vue derrière le proxy de l'hébergeur. */
function publicOrigin(req: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}`;
}

export const PUT = adminRoute<P>("animateur", async (req, { params }, user) => {
  const { id } = await params;
  const slide = await parseBody(req, slideSchema);
  return json(await setSlide(getDb(), user, id, slide));
});
