import { Share2Icon, FileTextIcon, UploadIcon } from "@radix-ui/react-icons";
type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut: string;
};
type ActionItem = NavItem;
export const navItems: NavItem[] = [
  { label: "Graph", href: "/", icon: Share2Icon, shortcut: "" },
  { label: "All notes", href: "/notes", icon: FileTextIcon, shortcut: "" },
  { label: "Uploads", href: "/uploads", icon: UploadIcon, shortcut: "" },
];
export const actionItems: ActionItem[] = [
  {
    label: "Upload PDF, audio, or video",
    href: "/uploads",
    icon: UploadIcon,
    shortcut: "",
  },
];
export type { NavItem, ActionItem };
