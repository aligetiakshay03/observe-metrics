import { z } from "zod";
import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { assertNotGuest, requireUser } from "@/server/auth/context";
import { hashPassword, passwordSchema, verifyPassword } from "@/server/auth/password";
import { revokeAllSessions } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";

const schema = z
  .object({ currentPassword: z.string().max(200).optional(), newPassword: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match." });

export const POST = route(async (req) => {
  const auth = await requireUser(req);
  assertNotGuest(auth, "set a password");
  await enforceRateLimit(`pwchange:${auth.user.id}`, 5, 900);
  const body = await parseBody(req, schema);
  if (auth.user.passwordHash && !(await verifyPassword(body.currentPassword ?? "", auth.user.passwordHash))) {
    throw E.invalid("Current password is incorrect.", { currentPassword: "Current password is incorrect." });
  }
  await prisma.user.update({ where: { id: auth.user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
  await revokeAllSessions(auth.user.id, auth.session.id);
  const ms = await prisma.workspaceMember.findMany({ where: { userId: auth.user.id }, select: { workspaceId: true } });
  for (const m of ms) await audit({ workspaceId: m.workspaceId, actorId: auth.user.id, action: "security.password_changed", ip: clientIp(req) });
  return ok({ changed: true });
});

export const dynamic = "force-dynamic";
