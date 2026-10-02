import { RunConsole } from "@/components/admin/RunConsole";

export default async function RunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <RunConsole runId={id} initialTab={tab} />;
}
