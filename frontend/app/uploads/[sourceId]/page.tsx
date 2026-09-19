import { SourceDetailView } from "@/components/source-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId } = await params;
  return <SourceDetailView key={sourceId} id={sourceId} />;
}
