"use client";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

type GradientTabsProps = {
  items: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
};

export function GradientTabs({
  items,
  value,
  onValueChange,
  className,
}: GradientTabsProps) {
  return (
    <div
      role="tablist"
      data-slot="gradient-tabs"
      className={cn(
        "inline-flex items-center gap-1 border bg-linear-to-b from-primary/10 to-primary/20 backdrop-blur-sm rounded-full border-primary/30 p-0.5 dark:border-primary/50",
        className,
      )}
    >
      <div className="flex flex-row gap-0.5 bg-muted rounded-full border p-0.5">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <Button
              key={item.value}
              type="button"
              role="tab"
              size="sm"
              variant={active ? "gradient_primary" : "ghost"}
              aria-selected={active}
              onClick={() => onValueChange(item.value)}
              className="rounded-full hover:bg-primary/10 cursor-pointer"
            >
              {item.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
