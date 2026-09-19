"use client";

import { useState } from "react";
import {
  Archive,
  Bell,
  ChevronRight,
  Folder,
  FolderClosed,
  FolderOpen,
  ListFilter,
  Package,
  Plus,
  Rocket,
  StickyNote,
  Tag,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

type Item = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  active?: boolean;
};

const mainItems: Item[] = [
  { title: "Inbox", icon: Bell, badge: 12, active: true },
  { title: "All Notes", icon: StickyNote, badge: 24 },
  { title: "Archive", icon: Archive },
];

const viewItems: Item[] = [{ title: "Start here!", icon: Rocket, badge: 15 }];

const typeItems: Item[] = [
  { title: "Projects", icon: Package, badge: 2 },
  { title: "Notes", icon: StickyNote, badge: 14 },
  { title: "Topics", icon: Tag, badge: 1 },
  { title: "People", icon: Users, badge: 1 },
  { title: "Types", icon: Package, badge: 5 },
];

const folders: {
  title: string;
  children: string[];
}[] = [
  { title: "Getting Started", children: ["attachments", "views"] },
  { title: "Journal", children: ["daily", "weekly"] },
];

function GroupLabel({
  label,
  open,
  onToggle,
  action,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  action: React.ReactNode;
}) {
  return (
    <SidebarGroupLabel className="group/label h-6 text-sm font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 cursor-pointer items-center gap-1 text-left"
      >
        <ChevronRight
          className={`size-4 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {label}
      </button>
      {action}
    </SidebarGroupLabel>
  );
}

export function AppSidebar() {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    main: true,
    views: true,
    types: true,
    folders: true,
  });
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    "Getting Started": true,
  });

  const toggle = (setter: typeof setOpenGroups, key: string) => {
    setter((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sections = [
    { id: "views", label: "Views", items: viewItems, action: "Add view" },
    { id: "types", label: "Types", items: typeItems, action: "Filter" },
  ] as const;

  return (
    <Sidebar>
      <SidebarContent className="bg-primary/5 px-1.5 py-1 text-sm">
        <SidebarGroup className="min-h-0 gap-0 py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={item.active}
                    className="h-7 rounded-sm text-[13px] hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent data-[active=true]:text-primary font-normal"
                  >
                    <item.icon className="size-3.5" />
                    <span className="truncate">{item.title}</span>
                  </SidebarMenuButton>
                  {item.badge != null && (
                    <SidebarMenuBadge className="text-[10px] tabular-nums text-sidebar-foreground/60">
                      {item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {sections.map((section) => (
          <SidebarGroup key={section.id} className="min-h-0 gap-0 py-1">
            <GroupLabel
              label={section.label}
              open={openGroups[section.id]}
              onToggle={() => toggle(setOpenGroups, section.id)}
              action={
                <SidebarGroupAction title={section.action} className="size-4">
                  {section.action === "Filter" ? (
                    <ListFilter className="size-3" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                </SidebarGroupAction>
              }
            />
            {openGroups[section.id] && (
              <SidebarGroupContent className="mt-0.5">
                <SidebarMenu className="gap-0">
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton className="h-7 rounded-sm text-[13px] hover:bg-sidebar-accent font-normal">
                        <item.icon className="size-3.5 text-blue-500" />
                        <span className="truncate">{item.title}</span>
                      </SidebarMenuButton>
                      {item.badge != null && (
                        <SidebarMenuBadge className="text-[10px] tabular-nums text-sidebar-foreground/60">
                          {item.badge}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        ))}

        <SidebarGroup className="min-h-0 gap-0 py-1">
          <GroupLabel
            label="Folders"
            open={openGroups.folders}
            onToggle={() => toggle(setOpenGroups, "folders")}
            action={
              <SidebarGroupAction title="Add folder" className="size-4">
                <Plus className="size-3" />
              </SidebarGroupAction>
            }
          />
          {openGroups.folders && (
            <SidebarGroupContent className="mt-0.5">
              <SidebarMenu className="gap-0">
                {folders.map((folder) => {
                  const folderOpen = openFolders[folder.title] ?? false;
                  return (
                    <SidebarMenuItem key={folder.title}>
                      <SidebarMenuButton
                        onClick={() => toggle(setOpenFolders, folder.title)}
                        className="h-7 rounded-sm text-[13px] hover:bg-sidebar-accent font-normal"
                      >
                        {folderOpen ? (
                          <FolderOpen className="size-3.5" />
                        ) : (
                          <FolderClosed className="size-3.5" />
                        )}
                        <span className="truncate">{folder.title}</span>
                      </SidebarMenuButton>
                      {folderOpen && folder.children.length > 0 && (
                        <SidebarMenuSub className="mr-0 border-l-0 px-0">
                          {folder.children.map((child) => (
                            <SidebarMenuSubItem key={child}>
                              <SidebarMenuSubButton className="h-6 text-xs text-sidebar-foreground/80 font-normal before:hidden">
                                <Folder className="size-3 text-sidebar-foreground/50" />
                                <span className="truncate pl-2">{child}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
