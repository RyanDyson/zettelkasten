"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const path = usePathname();
  if (path === "/") {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-30">
        <SidebarTrigger className="pointer-events-auto bg-background/80 backdrop-blur-sm" />
      </div>
    );
  }
  const title = path.startsWith("/notes")
    ? "All notes"
    : path.startsWith("/uploads")
      ? "Uploads"
      : "Knowledge graph";
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-3 border-b px-4 md:px-6">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4!" />
      <span className="text-sm font-medium">{title}</span>
      <Button asChild variant="gradient_primary" className="ml-auto">
        <Link href="/uploads">
          <Plus className="size-4" />
          Add source
        </Link>
      </Button>
    </header>
  );
}
