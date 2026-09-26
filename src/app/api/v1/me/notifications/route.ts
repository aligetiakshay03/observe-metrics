import { z } from "zod";
import { prisma } from "@/server/db";
import { clientIp, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { readPrefs } from "@/server/alerts";
import { audit } from "@/server/audit";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  return ok({ prefs: readPrefs(ctx.member.notificationPrefs) });
});

const b = z.boolean();
const schema = z.object({
  inApp: z.object({ costAnomaly: b, budget: b, providerSync: b, performance: b, optimization: b }),
  email: z.object({ budget: b, critical: b }),
});

export const PUT = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const prefs = await parseBody(req, schema);
  await prisma.workspaceMember.update({ where: { id: ctx.member.id }, data: { notificationPrefs: prefs } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "settings.notifications_updated", ip: clientIp(req) });
  return ok({ prefs });
});

export const dynamic = "force-dynamic";
