import "server-only";
import type { NextResponse } from "next/server";
import type { Session, User } from "@prisma/client";
import { prisma } from "../db";
import { randomToken, sha256 } from "../secrets";

export const SESSION_COOKIE = "om_session";
export const WORKSPACE_COOKIE = "om_ws";

const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SHORT_MS = 24 * 60 * 60 * 1000; // 24h server-side for non-remembered sessions
const GUEST_MS = 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 10 * 60 * 1000;

export interface CreatedSession {
  token: string;
  session: Session;
}

export async function createSession(
  userId: string,
  opts: { remember: boolean; guest?: boolean; userAgent?: string | null; ip?: string | null },
): Promise<CreatedSession> {
  const token = randomToken(32);
  const ttl = opts.guest ? GUEST_MS : opts.remember ? REMEMBER_MS : SHORT_MS;
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttl),
      remember: opts.remember,
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
      ip: opts.ip?.slice(0, 64) ?? null,
    },
  });
  return { token, session };
}

/** Resolve a raw cookie token to a live session + user; touches lastSeenAt. */
export async function validateSessionToken(token: string | undefined | null): Promise<{ session: Session; user: User } | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    // Sliding expiry for remembered sessions.
    const data: { lastSeenAt: Date; expiresAt?: Date } = { lastSeenAt: new Date() };
    if (session.remember) data.expiresAt = new Date(Date.now() + REMEMBER_MS);
    await prisma.session.update({ where: { id: session.id }, data }).catch(() => undefined);
  }
  const { user, ...rest } = session;
  return { session: rest as Session, user };
}

export async function revokeSessionToken(token: string | undefined | null) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}

const secure = () => process.env.NODE_ENV === "production";

export function setSessionCookie(res: NextResponse, token: string, remember: boolean, guest = false) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    // Non-remembered sessions are browser-session cookies.
    ...(remember || guest ? { maxAge: Math.floor((guest ? GUEST_MS : REMEMBER_MS) / 1000) } : {}),
  });
}

export function clearSessionCookies(res: NextResponse) {
  for (const name of [SESSION_COOKIE, WORKSPACE_COOKIE]) {
    res.cookies.set({ name, value: "", httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: 0 });
  }
}

export function setWorkspaceCookie(res: NextResponse, workspaceId: string) {
  res.cookies.set({
    name: WORKSPACE_COOKIE,
    value: workspaceId,
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}
