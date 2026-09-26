"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { api, clearApiCache } from "@/lib/api-client";
import type { MeResponse, Role } from "@/lib/types";

interface MeCtx {
  me: MeResponse;
  refresh: () => Promise<void>;
  switchWorkspace: (id: string, to?: string) => Promise<void>;
  can: (min: Role) => boolean;
}

const Ctx = createContext<MeCtx | null>(null);
const RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function useMe() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMe must be used inside MeProvider");
  return v;
}

export function MeProvider({ initial, children }: { initial: MeResponse; children: React.ReactNode }) {
  const [me, setMe] = useState(initial);
  const refresh = useCallback(async () => {
    setMe(await api<MeResponse>("/api/v1/me"));
  }, []);
  const switchWorkspace = useCallback(
    async (id: string, to = "/dashboard") => {
      await api("/api/v1/workspaces/switch", { body: { workspaceId: id } });
      clearApiCache();
      // Full navigation: every mounted view must reload for the new workspace.
      window.location.assign(to);
    },
    [],
  );
  const can = useCallback((min: Role) => !!me.workspace && RANK[me.workspace.role] >= RANK[min], [me.workspace]);
  return <Ctx.Provider value={{ me, refresh, switchWorkspace, can }}>{children}</Ctx.Provider>;
}
