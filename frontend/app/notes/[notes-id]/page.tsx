import { NoteDetailView } from "@/components/note-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ "notes-id": string }>;
}) {
  const { "notes-id": id } = await params;
  return <NoteDetailView key={id} id={id} />;
}
