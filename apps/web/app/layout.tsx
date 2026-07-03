import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "../components/providers";

export const metadata: Metadata = {
  title: "Weave — Cognitive Runtime",
  description: "Shared organizational memory where skills emerge from the team's work.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
