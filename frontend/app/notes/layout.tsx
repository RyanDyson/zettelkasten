import { NotesLayout } from "@/components/notes-panel/main";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <NotesLayout>{children}</NotesLayout>;
}
