import { NoteDetailView } from "@/components/note-detail";
import { ChatPanel } from "@/components/chat-panel";
export default async function Page({
  params,
}: {
  params: Promise<{ "notes-id": string }>;
}) {
  const { "notes-id": id } = await params;
  return (
    <>
      <NoteDetailView key={id} id={id} />
      <ChatPanel noteId={id} />
    </>
  );
}
