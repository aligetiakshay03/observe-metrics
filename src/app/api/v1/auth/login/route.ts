import { z } from "zod";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { ok, errors, handler } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { SESSION_COOKIE } from "@/lib/auth";
import { createSessionToken } from "@/lib/jwt";

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = handler(async (req) => {
  if (!(await rateLimit("login:" + clientIp(req), 10, 60))) {
    return errors.tooMany();
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errors.badRequest("Email and password are required");

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!user || !user.passwordHash) {
    // Constant-ish time: still run a hash comparison to blunt timing oracles.
    await bcrypt.compare(parsed.data.password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    return errors.fail401();
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return errors.fail401();

  const token = await createSessionToken({ userId: user.id, email: user.email });
  const res = ok({ user: { id: user.id, name: user.name, email: user.email } });
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
