import { cn } from "@/lib/utils";

export const KeyboardIcon = ({
  text,
  className,
  ...props
}: {
  text: string | React.ReactElement;
} & React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        "bg-background border-border flex size-4 items-center justify-center rounded-sm border font-mono text-[9px]",
        className,
      )}
      {...props}
    >
      {text}
    </div>
  );
};
