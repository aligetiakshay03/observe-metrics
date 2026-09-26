import { z } from "zod";
import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { assertNotGuest, requireUser } from "@/server/auth/context";
import { setWorkspaceCookie } from "@/server/auth/session";
import { sha256 } from "@/server/secrets";
import { audit } from "@/server/audit";

const schema = z.object({ token: z.string().min(16).max(200) });

async function findInvite(token: string) {
  const invite = await prisma.invite.findUnique({ where: { token: sha256(token) }, include: { workspace: { select: { id: true, name: true } } } });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) return null;
  return invite;
}

/** Preview an invite (workspace name + role) before accepting. */
export const GET = route(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const invite = token ? await findInvite(token) : null;
  if (!invite) throw E.notFound("Invitation");
  return ok({ workspaceName: invite.workspace.name, role: invite.role, email: invite.email });
});

export const POST = route(async (req) => {
  const auth = await requireUser(req);
  assertNotGuest(auth, "accept invitations");
  const { token } = await parseBody(req, schema);
  const invite = await findInvite(token);
  if (!invite) throw E.notFound("Invitation");
  // The invite is bound to the invited email address.
  if (invite.email !== auth.user.email.toLowerCase()) {
    throw E.forbidden(`This invitation was sent to ${invite.email}. Sign in with that account to accept it.`);
  }
  await prisma.$transaction([
    prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: auth.user.id, workspaceId: invite.workspaceId } },
      create: { userId: auth.user.id, workspaceId: invite.workspaceId, role: invite.role },
      update: {},
    }),
    prisma.invite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" } }),
  ]);
  await audit({ workspaceId: invite.workspaceId, actorId: auth.user.id, action: "member.joined", metadata: { email: invite.email, role: invite.role }, ip: clientIp(req) });
  const res = ok({ workspaceId: invite.workspaceId });
  setWorkspaceCookie(res, invite.workspaceId);
  return res;
});

export const dynamic = "force-dynamic";
