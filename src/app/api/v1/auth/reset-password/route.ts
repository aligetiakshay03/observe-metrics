import { z } from "zod";
import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { sha256 } from "@/server/secrets";
import { hashPassword, passwordSchema } from "@/server/auth/password";
import { revokeAllSessions } from "@/server/auth/session";
import { audit } from "@/server/audit";

const schema = z
  .object({ token: z.string().min(20).max(200), password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match." });

export const POST = route(async (req) => {
  const ip = clientIp(req);
  await enforceRateLimit(`reset:${ip}`, 10, 900);
  const body = await parseBody(req, schema);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(body.token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw E.invalid("This reset link is invalid or has expired. Request a new one.");
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(body.password) } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ]);
  // A reset invalidates every existing session.
  await revokeAllSessions(row.userId);
  const memberships = await prisma.workspaceMember.findMany({ where: { userId: row.userId }, select: { workspaceId: true } });
  for (const m of memberships) await audit({ workspaceId: m.workspaceId, actorId: row.userId, action: "security.password_changed", metadata: { via: "reset_link" }, ip });
  return ok({ reset: true });
});

export const dynamic = "force-dynamic";
