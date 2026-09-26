import { ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { search } from "@/server/search";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  await enforceRateLimit(`search:${ctx.user.id}`, 120, 60);
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return ok({ results: await search(ctx.workspace.id, q) });
});

export const dynamic = "force-dynamic";
