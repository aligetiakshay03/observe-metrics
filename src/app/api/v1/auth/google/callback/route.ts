import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { clientIp, route } from "@/server/http";
import { env } from "@/server/env";
import { createSession, setSessionCookie } from "@/server/auth/session";
import { logger } from "@/server/log";

const log = logger("oauth");

function fail(reason: string) {
  return NextResponse.redirect(`${env.appUrl}/signin?error=${encodeURIComponent(reason)}`, 302);
}

export const GET = route(async (req) => {
  if (!env.googleAuthEnabled) return fail("google_unavailable");
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("google_failed");

  const stateRow = await prisma.oAuthState.findUnique({ where: { state } });
  if (!stateRow || stateRow.expiresAt < new Date()) return fail("google_expired");
  await prisma.oAuthState.delete({ where: { state } });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${env.appUrl}/api/v1/auth/google/callback`,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) {
    log.warn(`token exchange failed: HTTP ${tokenRes.status}`);
    return fail("google_failed");
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!profileRes.ok) return fail("google_failed");
  const profile = (await profileRes.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  // Only trust verified Google emails — otherwise an attacker could claim an existing account's email.
  if (!profile.email || profile.email_verified !== true) return fail("google_unverified");

  const email = profile.email.toLowerCase();
  let user = await prisma.user.findFirst({ where: { OR: [{ googleId: profile.sub }, { email }] } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name: profile.name ?? email.split("@")[0], googleId: profile.sub, avatarUrl: profile.picture ?? null } });
  } else if (!user.googleId) {
    user = await prisma.user.update({ where: { id: user.id }, data: { googleId: profile.sub, avatarUrl: user.avatarUrl ?? profile.picture ?? null } });
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const hasWorkspace = await prisma.workspaceMember.count({ where: { userId: user.id, workspace: { isDemo: false } } });
  const { token } = await createSession(user.id, { remember: true, userAgent: req.headers.get("user-agent"), ip: clientIp(req) });
  const res = NextResponse.redirect(`${env.appUrl}${hasWorkspace ? "/dashboard" : "/onboarding"}`, 302);
  setSessionCookie(res, token, true);
  return res;
});

export const dynamic = "force-dynamic";
