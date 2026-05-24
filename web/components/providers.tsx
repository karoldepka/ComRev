"use client";

import { useMemo, type ReactNode } from "react";
import { Provider } from "urql";
import { makeClient } from "@/lib/urql";

export function Providers({ children }: { children: ReactNode }) {
  const client = useMemo(() => makeClient(), []);
  return <Provider value={client}>{children}</Provider>;
}
