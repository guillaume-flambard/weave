"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="wv-fade-in min-h-0 flex-1 flex flex-col" style={{ animationDuration: "220ms" }}>
      {children}
    </div>
  );
}
