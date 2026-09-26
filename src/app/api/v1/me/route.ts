import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, parseBody, route } from "@/server/http";
import { requireUser } from "@/server/auth/context";
import { readCookie, WORKSPACE_COOKIE } from "@/server/auth/session";
import { buildMe } from "@/server/workspaces";

export const GET = route(async (req) => {
  const auth = await requireUser(req);
  return ok(await buildMe(auth, readCookie(req, WORKSPACE_COOKIE)));
});

const patch = z.object({ name: z.string().trim().min(1, "Enter your name.").max(100) });

export const PATCH = route(async (req) => {
  const auth = await requireUser(req);
  const body = await parseBody(req, patch);
  await prisma.user.update({ where: { id: auth.user.id }, data: { name: body.name } });
  return ok({ updated: true });
});

export const dynamic = "force-dynamic";
