"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ShellActor, ShellOrganization } from "../../lib/shell-session";

interface ShellSessionValue {
  actor: ShellActor;
  organizations: ShellOrganization[];
}

const ShellSessionContext = createContext<ShellSessionValue | null>(null);

export function ShellSessionProvider({
  actor,
  organizations,
  children,
}: ShellSessionValue & { children: ReactNode }) {
  return (
    <ShellSessionContext.Provider value={{ actor, organizations }}>
      {children}
    </ShellSessionContext.Provider>
  );
}

export function useShellSession(): ShellSessionValue {
  const value = useContext(ShellSessionContext);
  if (!value) throw new Error("useShellSession must be used inside the application shell.");
  return value;
}
