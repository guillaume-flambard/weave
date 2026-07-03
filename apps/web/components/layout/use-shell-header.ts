"use client";

import { ReactNode, useLayoutEffect, useRef } from "react";
import { useShellHeaderContext } from "./shell-header-context";

export function useShellHeader(header: { subtitle?: string; actions?: ReactNode }) {
  const { setHeader } = useShellHeaderContext();
  const headerRef = useRef(header);
  headerRef.current = header;

  useLayoutEffect(() => {
    setHeader(headerRef.current);
    return () => setHeader({});
  }, [setHeader, header.subtitle, header.actions]);
}
