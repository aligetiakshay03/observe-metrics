import { z } from "zod";
import { prisma } from "@/server/db";
import { E, ok, parseBody, route } from "@/server/http";
import { requireUser } from "@/server/auth/context";
import { setWorkspaceCookie } from "@/server/auth/session";

const schema = z.object({ workspaceId: z.string().min(1).max(64) });

export const POST = route(async (req) => {
  const auth = await requireUser(req);
  const { workspaceId } = await parseBody(req, schema);
  const member = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: auth.user.id, workspaceId } } });
  // Membership is required — a guessed id is indistinguishable from a missing one.
  if (!member) throw E.notFound("Workspace");
  const res = ok({ workspaceId });
  setWorkspaceCookie(res, workspaceId);
  return res;
});

export const dynamic = "force-dynamic";
