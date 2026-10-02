import { StationOkScreen } from "@/components/participant/screens/Station";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <StationOkScreen code={code} />;
}
