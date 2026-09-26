import { z } from "zod";
import { clientIp, ok, parseBody, route } from "@/server/http";
import { assertNotGuest, requireUser } from "@/server/auth/context";
import { setWorkspaceCookie } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/rate-limit";
import { createWorkspace } from "@/server/workspaces";

const schema = z.object({
  name: z.string().trim().min(2, "Workspace name must be at least 2 characters.").max(60),
  companyName: z.string().trim().max(100).optional().nullable(),
  jobFunction: z.enum(["Founder", "CTO", "Engineering", "Finance", "Product", "Other"]).optional().nullable(),
});

export const POST = route(async (req) => {
  const auth = await requireUser(req);
  assertNotGuest(auth, "create a workspace");
  await enforceRateLimit(`ws-create:${auth.user.id}`, 10, 3600);
  const body = await parseBody(req, schema);
  const workspace = await createWorkspace(auth.user.id, body, clientIp(req));
  const res = ok({ workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug } }, { status: 201 });
  setWorkspaceCookie(res, workspace.id);
  return res;
});

export const dynamic = "force-dynamic";
