import { createHash } from "node:crypto";
import { json, withApi } from "@/lib/api/http";
import { currentRunPayload } from "@/lib/participant/service";

export const dynamic = "force-dynamic";

/** Séance live et phase, interrogée toutes les 10 s. Sans jeton. ETag pour obtenir 304. */
export const GET = withApi(async (req) => {
  const payload = await currentRunPayload();
  const { server_time: _ignored, ...stable } = payload;
  void _ignored;
  const etag = `"${createHash("sha1").update(JSON.stringify(stable)).digest("hex").slice(0, 16)}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
  }
  return json(payload, { headers: { ETag: etag } });
});
