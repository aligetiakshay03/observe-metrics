import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError, clientIp, ok, parseBody, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { verifyPassword } from "@/server/auth/password";
import { createSession, setSessionCookie } from "@/server/auth/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(200),
  password: z.string().min(1, "Enter your password.").max(200),
  remember: z.boolean().optional().default(false),
});

export const POST = route(async (req) => {
  const ip = clientIp(req);
  await enforceRateLimit(`signin:ip:${ip}`, 20, 300, "Too many sign-in attempts. Please wait a few minutes.");
  const body = await parseBody(req, schema);
  await enforceRateLimit(`signin:email:${body.email}`, 8, 900, "Too many attempts for this account. Please wait 15 minutes or reset your password.");

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  const valid = await verifyPassword(body.password, user?.passwordHash);
  if (!user || !valid || user.isGuest) {
    throw new ApiError("unauthorized", "Incorrect email or password.");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const { token } = await createSession(user.id, { remember: body.remember, userAgent: req.headers.get("user-agent"), ip });
  const hasWorkspace = await prisma.workspaceMember.count({ where: { userId: user.id, workspace: { isDemo: false } } });
  const res = ok({ user: { id: user.id, name: user.name, email: user.email }, next: hasWorkspace ? "/dashboard" : "/onboarding" });
  setSessionCookie(res, token, body.remember);
  return res;
});

export const dynamic = "force-dynamic";
