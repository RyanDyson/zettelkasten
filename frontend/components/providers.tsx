"use client";

import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { shouldRetry } from "@/hooks/use-vault";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 2000, retry: shouldRetry } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <SidebarProvider
          style={
            {
              "--sidebar-width": "16rem",
              "--header-height": "3.5rem",
            } as React.CSSProperties
          }
        >
          <Toaster position="top-center" richColors />
          {children}
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
