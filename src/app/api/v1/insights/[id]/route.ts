import { z } from "zod";
import { prisma } from "@/server/db";
import { E, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { insightDetail } from "@/server/insights/queries";

type P = { params: { id: string } };

export const GET = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req);
  const detail = await insightDetail(ctx.workspace.id, params.id, ctx.workspace.isDemo);
  if (!detail) throw E.notFound("Insight");
  return ok(detail);
});

const schema = z.object({ status: z.enum(["OPEN", "DISMISSED", "RESOLVED"]) });

export const PATCH = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req, "MEMBER");
  const { status } = await parseBody(req, schema);
  const res = await prisma.insight.updateMany({ where: { id: params.id, workspaceId: ctx.workspace.id }, data: { status } });
  if (!res.count) throw E.notFound("Insight");
  // Resolving/dismissing an insight resolves its alerts too.
  if (status !== "OPEN") {
    await prisma.alert.updateMany({ where: { workspaceId: ctx.workspace.id, insightId: params.id, resolvedAt: null }, data: { resolvedAt: new Date(), readAt: new Date() } });
  }
  return ok({ status });
});

export const dynamic = "force-dynamic";
