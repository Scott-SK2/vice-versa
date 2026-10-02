import { ProjectionScreen } from "@/components/projection/ProjectionScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "VICE VERSA — Projection" };

export default async function ProjectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { runId } = await params;
  const { key } = await searchParams;
  return <ProjectionScreen runId={runId} projectionKey={key ?? ""} />;
}
