import { z } from "zod";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { ok, errors, handler } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { SESSION_COOKIE } from "@/lib/auth";
import { createSessionToken } from "@/lib/jwt";
import crypto from "crypto";

type Params = { params: Promise<{ token: string }> };

export const GET = handler(async (_req: Request, { params }: Params) => {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { organization: { select: { name: true, slug: true } } },
  });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return errors.notFound("Invitation");
  }
  return ok({
    email: invite.email,
    role: invite.role,
    team: invite.team,
    organization: invite.organization,
  });
});

const AcceptSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  password: z.string().min(8).max(200).optional(),
});

export const POST = handler(async (req: Request, { params }: Params) => {
  if (!(await rateLimit("invite-accept:" + clientIp(req), 20, 60))) return errors.tooMany();
  const { token } = await params;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return errors.notFound("Invitation");
  }

  const parsed = AcceptSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return errors.badRequest("Invalid payload");

  const email = invite.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    if (!parsed.data.password) {
      return errors.badRequest("Password required to create your account");
    }
    user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name ?? email.split("@")[0],
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
      },
    });
  }

  const alreadyMember = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId: invite.organizationId } },
  });
  if (!alreadyMember) {
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: invite.organizationId,
        role: invite.role,
        team: invite.team,
      },
    });
  }
  await prisma.invite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" } });

  const sessionToken = await createSessionToken({ userId: user.id, email: user.email });
  const res = ok({
    user: { id: user.id, email: user.email },
    organizationId: invite.organizationId,
  });
  (res.cookies as unknown as { set: (c: object) => void }).set({
    name: SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
});
