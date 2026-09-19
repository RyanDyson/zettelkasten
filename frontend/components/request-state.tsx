import { AlertCircle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadingState({
  children = "Loading…",
}: {
  children?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"
    >
      <LoaderCircle className="size-4 animate-spin" />
      {children}
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="m-6 rounded-xl border border-destructive/25 bg-destructive/5 p-5 text-sm"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertCircle className="size-4 shrink-0" />
        {error.message}
      </p>
      {retry && (
        <Button variant="outline" className="mt-3" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
