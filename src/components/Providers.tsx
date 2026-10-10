"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { GOOGLE_LOGIN } from "@/lib/features";

export function Providers({ children }: { children: ReactNode }) {
  return GOOGLE_LOGIN ? <SessionProvider>{children}</SessionProvider> : <>{children}</>;
}
