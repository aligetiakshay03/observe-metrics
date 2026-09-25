import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext, requireAdmin } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { sendEmail, inviteEmailHtml } from "@/lib/email";
import { planOf } from "@/lib/plans";
import crypto from "crypto";

export const GET = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();

  const members = await prisma.membership.findMany({
    where: { organizationId: ctx.org.id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
  const invites = await prisma.invite.findMany({
    where: { organizationId: ctx.org.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  return ok({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      team: m.team,
      createdAt: m.createdAt,
      user: m.user,
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      team: i.team,
      status: i.status,
      expiresAt: i.expiresAt,
    })),
  });
});

const InviteSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  team: z.string().max(60).nullable().optional(),
});

export const POST = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!requireAdmin(ctx)) return errors.forbidden();
  if (!(await rateLimit("invite:" + clientIp(req), 20, 60))) return errors.tooMany();

  const parsed = InviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errors.badRequest("Invalid invite payload", parsed.error.flatten().fieldErrors);

  const email = parsed.data.email.toLowerCase();
  const limits = planOf(ctx.org.plan);

  const memberCount = await prisma.membership.count({ where: { organizationId: ctx.org.id } });
  if (limits.maxMembers !== -1 && memberCount >= limits.maxMembers) {
    return errors.forbidden();
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const alreadyMember = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: existingUser.id, organizationId: ctx.org.id } },
    });
    if (alreadyMember) return errors.conflict("This user is already a member of the organization");
  }

  const invite = await prisma.invite.upsert({
    where: { organizationId_email: { organizationId: ctx.org.id, email } },
    create: {
      organizationId: ctx.org.id,
      email,
      role: parsed.data.role,
      team: parsed.data.team ?? null,
      token: crypto.randomBytes(24).toString("hex"),
      invitedById: ctx.user.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
    update: {
      role: parsed.data.role,
      team: parsed.data.team ?? null,
      token: crypto.randomBytes(24).toString("hex"),
      status: "PENDING",
      invitedById: ctx.user.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });

  const inviteUrl = (process.env.APP_URL ?? new URL(req.url).origin) + "/invite/" + invite.token;
  await sendEmail({
    to: email,
    subject: "You've been invited to " + ctx.org.name + " on ObserveMetrics",
    html: inviteEmailHtml(ctx.org.name, inviteUrl, parsed.data.role),
    text: "Join " + ctx.org.name + " on ObserveMetrics: " + inviteUrl,
  });

  return ok({ invite: { id: invite.id, email: invite.email, role: invite.role, team: invite.team }, inviteUrl }, { status: 201 });
});

export const dynamic = "force-dynamic";
