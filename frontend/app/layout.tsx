import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { NavCommand } from "@/components/nav-command";

const sfPro = localFont({
  src: "../public/fonts/sf-pro-text_regular.woff2",
  weight: "400",
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Zettelkasten",
  description:
    "A local library for your documents, audio, and video transcripts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sfPro.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>
          <AppSidebar />
          <SidebarInset className="flex min-h-dvh flex-1 max-h-screen flex-col">
            <NavCommand />
            <SiteHeader />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>
          </SidebarInset>
        </Providers>
      </body>
    </html>
  );
}
