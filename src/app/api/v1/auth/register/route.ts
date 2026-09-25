import { z } from "zod";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { ok, errors, handler } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { SESSION_COOKIE } from "@/lib/auth";
import { createSessionToken } from "@/lib/jwt";

const BodySchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  organizationName: z.string().min(1).max(100),
});

export const POST = handler(async (req) => {
  if (!(await rateLimit("register:" + clientIp(req), 10, 60))) {
    return errors.tooMany();
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errors.badRequest("Invalid registration payload", parsed.error.flatten().fieldErrors);
  }
  const { name, email, password, organizationName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return errors.conflict("An account with this email already exists");

  const slugBase = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "org";
  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 10),
      memberships: {
        create: {
          role: "ADMIN",
          organization: {
            create: {
              name: organizationName,
              slug: slugBase + "-" + crypto.randomBytes(3).toString("hex"),
            },
          },
        },
      },
    },
    include: { memberships: { include: { organization: true } } },
  });

  const org = user.memberships[0]!.organization;
  const token = await createSessionToken({ userId: user.id, email: user.email });

  const res = ok({ user: { id: user.id, name: user.name, email: user.email }, organization: org });
  (res.cookies as unknown as { set: (c: object) => void }).set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
});
