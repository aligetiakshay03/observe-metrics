import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext } from "@/lib/auth";
import { syncOrg } from "@/lib/sync";

export const POST = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();

  // Inline sync — fine for MVP-scale orgs; large pulls should go through the queue.
  const result = await syncOrg(ctx.org.id);
  return ok(result);
});

export const dynamic = "force-dynamic";
