import { z } from "zod";
import { prisma } from "@/server/db";
import { clientIp, ok, parseBody, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { randomToken, sha256 } from "@/server/secrets";
import { passwordResetEmail, sendEmail } from "@/server/email";
import { env } from "@/server/env";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email.").max(200) });

const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Always responds the same way whether or not the account exists, so the
 * endpoint can't be used to discover registered emails.
 */
export const POST = route(async (req) => {
  const ip = clientIp(req);
  await enforceRateLimit(`forgot:ip:${ip}`, 10, 3600);
  const { email } = await parseBody(req, schema);
  await enforceRateLimit(`forgot:email:${email}`, 3, 3600);

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.isGuest) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    const token = randomToken(32);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    await sendEmail(passwordResetEmail(user.email, `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`));
  }
  return ok({ sent: true, delivery: env.smtpEnabled ? "email" : "server-log" });
});

export const dynamic = "force-dynamic";
