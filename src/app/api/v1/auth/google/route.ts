import crypto from "crypto";
import { prisma } from "@/lib/db";
import { handler, errors } from "@/lib/api";

export const GET = handler(async (req) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return errors.badRequest("Google OAuth is not configured on this deployment");

  const url = new URL(req.url);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? url.origin + "/api/v1/auth/google/callback";

  const state = crypto.randomBytes(24).toString("hex");
  await prisma.oAuthState.create({
    data: { state, expiresAt: new Date(Date.now() + 10 * 60_000) },
  });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  return Response.redirect(authUrl.toString(), 302);
});

export const dynamic = "force-dynamic";
