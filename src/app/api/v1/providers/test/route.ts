import { z } from "zod";
import { clientIp, ok, parseBody, route } from "@/server/http";
import { assertNotDemo, assertNotGuest, requireWorkspace } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { getAdapter, PROVIDER_IDS } from "@/server/providers/registry";
import type { ProviderId } from "@/server/providers/types";
import { audit } from "@/server/audit";

const schema = z.object({
  provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]),
  apiKey: z.string().trim().min(8, "Paste the full API key.").max(10_000),
});

/** Test a credential before saving it. The key is used once and discarded. */
export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  assertNotGuest(ctx, "test provider credentials");
  assertNotDemo(ctx, "test provider credentials");
  await enforceRateLimit(`provider-test:${ctx.user.id}`, 20, 600);
  const body = await parseBody(req, schema);
  const result = await getAdapter(body.provider).validateCredentials(body.apiKey);
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "provider.tested", metadata: { provider: body.provider, ok: result.ok, stored: false }, ip: clientIp(req) });
  return ok(result);
});

export const dynamic = "force-dynamic";
