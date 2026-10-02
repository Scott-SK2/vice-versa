import { StationScreen } from "@/components/participant/screens/Station";

/** Arrivée par QR : /vv26/s/3?k=<jeton>. Le jeton déclenche le scan puis disparaît de l'URL. */
export default async function Page({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ k?: string }> }) {
  const { code } = await params;
  const { k } = await searchParams;
  return <StationScreen code={code} qrToken={k ?? null} />;
}
