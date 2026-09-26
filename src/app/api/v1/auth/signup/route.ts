import { z } from "zod";
import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { hashPassword, passwordSchema } from "@/server/auth/password";
import { createSession, setSessionCookie } from "@/server/auth/session";

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter your full name.").max(100),
    email: z.string().trim().toLowerCase().email("Enter a valid work email.").max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match." });

export const POST = route(async (req) => {
  const ip = clientIp(req);
  await enforceRateLimit(`signup:${ip}`, 8, 3600, "Too many sign-up attempts from this network. Try again later.");
  const body = await parseBody(req, schema);

  const existing = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (existing) throw E.conflict("An account with this email already exists.", { email: "An account with this email already exists. Sign in instead." });

  const user = await prisma.user.create({
    data: { name: body.name, email: body.email, passwordHash: await hashPassword(body.password), lastLoginAt: new Date() },
  });
  const { token } = await createSession(user.id, { remember: true, userAgent: req.headers.get("user-agent"), ip });
  const res = ok({ user: { id: user.id, name: user.name, email: user.email }, next: "/onboarding" }, { status: 201 });
  setSessionCookie(res, token, true);
  return res;
});

export const dynamic = "force-dynamic";
