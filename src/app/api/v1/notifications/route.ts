import { prisma } from "@/server/db";
import { ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import type { NotificationItem } from "@/lib/types";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const where = { workspaceId: ctx.workspace.id, userId: ctx.user.id };
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);
  const items: NotificationItem[] = rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    href: n.href,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
  return ok({ notifications: items, unread });
});

export const dynamic = "force-dynamic";
