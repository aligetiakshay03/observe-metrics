import { prisma } from "@/lib/db";
import { handler, errors } from "@/lib/api";
import { createSessionToken } from "@/lib/jwt";
import { SESSION_COOKIE } from "@/lib/auth";

interface GoogleTokenResponse {
  access_token: string;
  id_token?: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export const GET = handler(async (req) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return errors.badRequest("Google OAuth is not configured");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return errors.badRequest("Missing code or state");

  const stateRow = await prisma.oAuthState.findUnique({ where: { state } });
  if (!stateRow || stateRow.expiresAt < new Date()) {
    return errors.badRequest("Invalid or expired OAuth state");
  }
  await prisma.oAuthState.delete({ where: { state } });

  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? url.origin + "/api/v1/auth/google/callback";

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return errors.badRequest("Google token exchange failed");
  const tokens = (await tokenRes.json()) as GoogleTokenResponse;

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: "Bearer " + tokens.access_token },
  });
  if (!profileRes.ok) return errors.badRequest("Failed to fetch Google profile");
  const profile = (await profileRes.json()) as GoogleUserInfo;

  const email = profile.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: profile.name ?? email.split("@")[0],
        googleId: profile.sub,
        avatarUrl: profile.picture,
      },
    });
  } else if (!user.googleId) {
    user = await prisma.user.update({ where: { id: user.id }, data: { googleId: profile.sub } });
  }

  // New Google users without an org get a personal org so onboarding works.
  const membershipCount = await prisma.membership.count({ where: { userId: user.id } });
  if (membershipCount === 0) {
    const org = await prisma.organization.create({
      data: {
        name: profile.name ? profile.name + "'s Org" : "My Org",
        slug: "org-" + profile.sub.slice(-8),
      },
    });
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: "ADMIN",
      },
    });
  }

  const token = await createSessionToken({ userId: user.id, email: user.email });
  const res = Response.redirect((process.env.APP_URL ?? url.origin) + "/dashboard", 302);
  const headers = new Headers(res.headers);
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}` +
      (process.env.NODE_ENV === "production" ? "; Secure" : ""),
  );
  return new Response(null, { status: 302, headers });
});
