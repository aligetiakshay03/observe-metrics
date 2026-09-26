import { z } from "zod";
import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { assertNotDemo, assertNotGuest, requireWorkspace, roleAtLeast } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { randomToken, sha256 } from "@/server/secrets";
import { inviteEmail, sendEmail } from "@/server/email";
import { env } from "@/server/env";
import { audit } from "@/server/audit";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const [members, invites] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { user: { select: { id: true, name: true, email: true, isGuest: true, lastLoginAt: true } }, team: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    roleAtLeast(ctx.role, "ADMIN")
      ? prisma.invite.findMany({ where: { workspaceId: ctx.workspace.id, status: "PENDING", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
  ]);
  return ok({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      jobFunction: m.jobFunction,
      team: m.team,
      joinedAt: m.createdAt,
      isYou: m.userId === ctx.user.id,
      user: { name: m.user.isGuest ? "Guest" : m.user.name, email: m.user.isGuest ? "—" : m.user.email, lastLoginAt: m.user.lastLoginAt },
    })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, createdAt: i.createdAt })),
    role: ctx.role,
  });
});

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(200),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
});

/** Invite by email. Invite tokens are stored hashed; the link is emailed (or shown once). */
export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  assertNotGuest(ctx, "invite teammates");
  assertNotDemo(ctx, "invite teammates");
  await enforceRateLimit(`invite:${ctx.user.id}`, 30, 3600);
  const { email, role } = await parseBody(req, schema);
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser && (await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: existingUser.id, workspaceId: ctx.workspace.id } } }))) {
    throw E.conflict("This person is already a member.", { email: "Already a member of this workspace." });
  }
  const token = randomToken(24);
  const invite = await prisma.invite.upsert({
    where: { workspaceId_email: { workspaceId: ctx.workspace.id, email } },
    create: { workspaceId: ctx.workspace.id, email, role, token: sha256(token), invitedById: ctx.user.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    update: { role, token: sha256(token), status: "PENDING", invitedById: ctx.user.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
  });
  const link = `${env.appUrl}/invite/${token}`;
  const delivered = await sendEmail(inviteEmail(email, ctx.workspace.name, ctx.user.name ?? ctx.user.email, link, role));
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "member.invited", targetType: "invite", targetId: invite.id, metadata: { email, role }, ip: clientIp(req) });
  // Without SMTP the inviter gets the link to share manually (it's shown only in this response).
  return ok({ invite: { id: invite.id, email, role }, emailed: delivered, link: delivered ? null : link }, { status: 201, headers: { "Cache-Control": "no-store" } });
});

export const dynamic = "force-dynamic";
