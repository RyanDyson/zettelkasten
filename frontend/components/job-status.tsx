import { Check, CircleAlert, Clock3, LoaderCircle } from "lucide-react";
import type { JobStatus } from "@/lib/api";
const states = {
  queued: {
    label: "Queued",
    Icon: Clock3,
    className: "bg-muted text-muted-foreground",
  },
  processing: {
    label: "Processing",
    Icon: LoaderCircle,
    className: "bg-primary/10 text-primary",
  },
  done: {
    label: "Ready",
    Icon: Check,
    className: "bg-emerald-50 text-emerald-700",
  },
  failed: {
    label: "Failed",
    Icon: CircleAlert,
    className: "bg-destructive/10 text-destructive",
  },
};
export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { label, Icon, className } = states[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${className}`}
    >
      <Icon
        className={`size-3 ${status === "processing" ? "animate-spin" : ""}`}
      />
      {label}
    </span>
  );
}
