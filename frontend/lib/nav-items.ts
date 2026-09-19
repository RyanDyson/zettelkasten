import {
  BellIcon,
  ArchiveIcon,
  Share2Icon,
  FilePlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  GearIcon,
} from "@radix-ui/react-icons";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut: string;
};

type ActionItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut: string;
};

export const navItems: NavItem[] = [
  { label: "Graph", href: "/", icon: Share2Icon, shortcut: "G G" },
  { label: "Inbox", href: "/notes", icon: BellIcon, shortcut: "G I" },
  { label: "Archive", href: "/notes", icon: ArchiveIcon, shortcut: "G A" },
];

export const actionItems: ActionItem[] = [
  { label: "New note", href: "/notes/1", icon: FilePlusIcon, shortcut: "N C" },
  {
    label: "Search notes",
    href: "/notes",
    icon: MagnifyingGlassIcon,
    shortcut: "S N",
  },
  {
    label: "Delete note",
    href: "/notes",
    icon: TrashIcon,
    shortcut: "D N",
  },
  { label: "Settings", href: "/notes", icon: GearIcon, shortcut: "S E" },
];

export type { NavItem, ActionItem };
