"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  MagnifyingGlassIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  EnterIcon,
} from "@radix-ui/react-icons";
import { navItems, actionItems } from "@/lib/nav-items";

export const GLOBAL_COMMAND_OPEN_EVENT = "app:open-command-palette";

export function openCommand() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GLOBAL_COMMAND_OPEN_EVENT));
}

export function openGlobalCommandPalette() {
  openCommand();
}

export function useCommandPalette() {
  return {
    openCommand,
  };
}

export function NavCommand() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    const onOpenEvent = () => setOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(GLOBAL_COMMAND_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(GLOBAL_COMMAND_OPEN_EVENT, onOpenEvent);
    };
  }, []);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      className="from-background/80 to-background/90 max-w-2xl bg-linear-to-b backdrop-blur-md"
    >
      <Command className="divide-border/70 flex flex-col divide-y bg-transparent px-0">
        <div className="border-border flex w-full items-center justify-center border-b text-sm font-medium">
          Quick Actions
        </div>

        <CommandInput
          className="p-0"
          placeholder="Search routes, actions, and workflows..."
        />

        <CommandList>
          <CommandEmpty>
            <div className="text-muted-foreground flex flex-col items-center gap-1 py-8 text-center text-xs">
              <MagnifyingGlassIcon className="size-4" />
              <p>No command found.</p>
              <p>
                Try &quot;notes&quot;, &quot;graph&quot;, or &quot;upload&quot;.
              </p>
            </div>
          </CommandEmpty>

          <CommandGroup heading="Apps">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <CommandItem
                  key={item.href}
                  onSelect={() => navigate(item.href)}
                  data-checked={isActive}
                  className="cursor-pointer py-2 transition-all duration-100"
                >
                  <Icon className="size-4" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {item.label}
                    </span>
                  </div>
                  {isActive && (
                    <span className="from-primary/20 to-primary/30 border-primary/40 text-primary rounded-md border bg-linear-to-b px-1.5 py-0.5 text-[10px] font-medium">
                      Current
                    </span>
                  )}
                  <CommandShortcut className="flex items-center justify-end gap-1">
                    {item.shortcut.split(" ").map((part, index) => (
                      <kbd
                        key={index}
                        className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        {part}
                      </kbd>
                    ))}
                  </CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Quick Actions">
            {actionItems.map((item) => {
              return (
                <CommandItem
                  key={item.label}
                  onSelect={() => navigate(item.href)}
                  className="cursor-pointer py-2 transition-all duration-100"
                >
                  <item.icon className="size-4" />
                  <span className="flex-1 text-sm font-medium">
                    {item.label}
                  </span>
                  <CommandShortcut className="flex items-center justify-end gap-1">
                    {item.shortcut.split(" ").map((part, index) => (
                      <kbd
                        key={index}
                        className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        {part}
                      </kbd>
                    ))}
                  </CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>

        <div className="text-muted-foreground border-t px-3 py-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <ArrowDownIcon className="size-3" />
              <ArrowUpIcon className="size-3" /> to navigate
            </span>
            <span className="flex items-center gap-1">
              Press
              <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
                <EnterIcon className="size-3" />
              </kbd>{" "}
              to run
            </span>
          </div>
        </div>
      </Command>
    </CommandDialog>
  );
}
