"use client";

import { useState } from "react";
import { ArrowUpRight, FolderOpen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

type Option = {
  id: string;
  icon: React.ReactNode;
  iconClass: string;
  badgeClass: string;
  title: string;
  description: string;
  onClick?: () => void;
};

const options: Option[] = [
  {
    id: "empty",
    icon: <Plus className="h-5 w-5" />,
    iconClass: "bg-blue-50 text-blue-500 dark:bg-blue-950 dark:text-blue-400",
    badgeClass: "bg-blue-50 text-blue-500 dark:bg-blue-950 dark:text-blue-400",
    title: "Create empty vault",
    description: "Start fresh in an empty folder with Zettel defaults",
    onClick: async () => {
      await openDirectoryPicker();
    },
  },
  {
    id: "open",
    icon: <FolderOpen className="h-5 w-5" />,
    iconClass:
      "bg-emerald-50 text-emerald-500 dark:bg-emerald-950 dark:text-emerald-400",
    badgeClass:
      "bg-emerald-50 text-emerald-500 dark:bg-emerald-950 dark:text-emerald-400",
    title: "Open existing vault",
    description: "Point to a folder you already have",
    onClick: async () => {
      await openDirectoryPicker();
    },
  },
];

async function openDirectoryPicker(): Promise<string | null> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;

  if (picker) {
    try {
      const handle = await picker();
      return handle.name;
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.onchange = () => {
      const file = input.files?.[0];
      const name = file
        ? (
            file as File & { webkitRelativePath: string }
          ).webkitRelativePath.split("/")[0]
        : null;
      resolve(name);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function Welcome({
  onSelect,
}: {
  onSelect?: (optionId: string, path: string | null) => void;
}) {
  const [, setSelected] = useState<string>("template");

  const handleClick = async (optionId: string) => {
    setSelected(optionId);
    const path = await openDirectoryPicker();
    onSelect?.(optionId, path);
  };

  return (
    <Dialog>
      <DialogContent className="w-full max-w-xl p-12 sm:max-w-xl">
        <DialogHeader className="flex flex-col items-center">
          <DialogTitle className="mt-6 text-center font-heading text-4xl tracking-tight text-zinc-900 dark:text-zinc-50">
            Welcome to ZettelKasten
          </DialogTitle>
          <DialogDescription className="mt-4 max-w-md text-center text-base leading-7">
            Choose a vault to start. If you had a vault here before, the folder
            may have moved or been deleted.
          </DialogDescription>
          <Separator className="mt-8" />
        </DialogHeader>

        <div className="mt-6 flex flex-col gap-4">
          {options.map((option) => (
            <Button
              key={option.id}
              type="button"
              onMouseEnter={() => setSelected(option.id)}
              onFocus={() => setSelected(option.id)}
              onClick={() => {
                void handleClick(option.id);
              }}
              variant="gradient_primary"
              className="h-fit"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${option.iconClass}`}
              >
                {option.icon}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {option.title}
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {option.description}
                </span>
              </span>
            </Button>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span>New to Zettel?</span>
          <Button
            asChild
            variant="link"
            className="h-auto p-0 text-sm font-medium text-blue-600 underline-offset-4 hover:text-blue-700 dark:text-blue-400"
          >
            <a
              href="https://zettelkasten.de/introduction/"
              target="_blank"
              rel="noreferrer"
            >
              Read the first-launch guide
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
