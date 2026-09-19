"use client";

import { NoteContextMenu } from "@/components/note-context-menu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Network, Upload, Search, ArrowUpRight } from "lucide-react";
import { useNotes, useSources } from "@/hooks/use-vault";
import { useNoteDrafts } from "@/hooks/use-note-drafts";
import { draftsFirst } from "@/lib/note-drafts";
import { API_URL } from "@/lib/api";
import { openCommand } from "@/components/nav-command";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const pathname = usePathname();
  const notes = useNotes();
  const { drafts } = useNoteDrafts();
  const sidebarNotes = draftsFirst(notes.data ?? [], drafts);
  const sources = useSources();
  const { isMobile, setOpenMobile } = useSidebar();
  const navigate = () => {
    if (isMobile) setOpenMobile(false);
  };
  const items = [
    { title: "Graph", href: "/", icon: Network, count: undefined },
    {
      title: "All notes",
      href: "/notes",
      icon: FileText,
      count: notes.data?.length,
    },
    {
      title: "Uploads",
      href: "/uploads",
      icon: Upload,
      count: sources.data?.length,
    },
  ];
  return (
    <Sidebar>
      <SidebarHeader className="px-5 py-6">
        <Link
          href="/"
          onClick={navigate}
          className="text-xl font-semibold tracking-tight"
        >
          Zettelkasten<span className="text-primary">.</span>
        </Link>
        <p className="text-xs text-muted-foreground">
          Your local knowledge library
        </p>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={openCommand}>
                  <Search className="size-4" />
                  Quick navigation
                  <span className="ml-auto text-xs text-muted-foreground">
                    ⌘ K
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href)
                    }
                  >
                    <Link href={item.href} onClick={navigate}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.count !== undefined && (
                    <SidebarMenuBadge>{item.count}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Recent notes</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarNotes
                .filter((note, index) => index < 5 || drafts[note.id])
                .map((note) => (
                  <SidebarMenuItem key={note.id}>
                    <NoteContextMenu noteId={note.id} title={note.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === `/notes/${note.id}`}
                      >
                        <Link href={`/notes/${note.id}`} onClick={navigate}>
                          <FileText className="size-3.5 text-primary" />
                          <span className="min-w-0 flex-1 truncate">
                            {note.title}
                          </span>
                          {drafts[note.id] && (
                            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              Editing
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </NoteContextMenu>
                  </SidebarMenuItem>
                ))}
              {!notes.isPending && !notes.error && !notes.data?.length && (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  Your first upload becomes your first note.
                </p>
              )}
              {notes.error && (
                <p className="px-2 text-xs text-destructive">
                  Library unavailable
                </p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <a
          href={`${API_URL}/docs`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between text-xs text-muted-foreground hover:text-primary"
        >
          API documentation
          <ArrowUpRight className="size-3.5" />
        </a>
      </SidebarFooter>
    </Sidebar>
  );
}
