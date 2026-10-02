"use client";

import { createContext, useContext } from "react";
import type { AdminUserDto } from "./types";

const Ctx = createContext<AdminUserDto | null>(null);

export function AdminUserProvider({ user, children }: { user: AdminUserDto; children: React.ReactNode }) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

export function useAdminUser(): AdminUserDto {
  const u = useContext(Ctx);
  if (!u) throw new Error("useAdminUser hors AdminUserProvider");
  return u;
}
