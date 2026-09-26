import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { E, route } from "@/server/http";
import { env } from "@/server/env";
import { randomToken } from "@/server/secrets";

/** Starts Google OAuth. Only available when GOOGLE_CLIENT_ID/SECRET are configured. */
export const GET = route(async () => {
  if (!env.googleAuthEnabled) throw E.notFound("Google sign-in");
  const state = randomToken(24);
  await prisma.oAuthState.create({ data: { state, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${env.appUrl}/api/v1/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(url.toString(), 302);
});

export const dynamic = "force-dynamic";
