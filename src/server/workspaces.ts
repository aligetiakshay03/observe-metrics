import "server-only";
import crypto from "crypto";
import type { MemberRole } from "@prisma/client";
import { prisma } from "./db";
import { slugify } from "./ingest/dimensions";
import { audit } from "./audit";
import type { MeResponse } from "@/lib/types";
import { env } from "./env";
import type { AuthContext } from "./auth/context";
import { resolveWorkspace } from "./auth/context";

export async function uniqueWorkspaceSlug(name: string): Promise<string> {
  const base = slugify(name).slice(0, 40) || "workspace";
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${crypto.randomBytes(3).toString("hex")}`;
    const taken = await prisma.workspace.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${base}-${crypto.randomBytes(6).toString("hex")}`;
}

export async function createWorkspace(
  userId: string,
  input: { name: string; companyName?: string | null; jobFunction?: string | null },
  ip?: string | null,
) {
  const workspace = await prisma.workspace.create({
    data: {
      name: input.name,
      companyName: input.companyName ?? null,
      slug: await uniqueWorkspaceSlug(input.name),
      members: { create: { userId, role: "OWNER", jobFunction: input.jobFunction ?? null } },
    },
  });
  await audit({ workspaceId: workspace.id, actorId: userId, action: "workspace.created", targetType: "workspace", targetId: workspace.id, metadata: { name: input.name }, ip });
  return workspace;
}

export async function buildMe(auth: AuthContext, requestedWorkspaceId: string | null): Promise<MeResponse> {
  const [resolved, members] = await Promise.all([
    resolveWorkspace(auth.user, requestedWorkspaceId),
    prisma.workspaceMember.findMany({
      where: { userId: auth.user.id },
      include: { workspace: { select: { id: true, name: true, isDemo: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    user: { id: auth.user.id, name: auth.user.name, email: auth.user.isGuest ? "Guest" : auth.user.email, avatarUrl: auth.user.avatarUrl, isGuest: auth.user.isGuest },
    workspace: resolved
      ? {
          id: resolved.workspace.id,
          name: resolved.workspace.name,
          slug: resolved.workspace.slug,
          companyName: resolved.workspace.companyName,
          isDemo: resolved.workspace.isDemo,
          role: resolved.member.role as MemberRole,
          onboarded: !!resolved.workspace.onboardingCompletedAt || resolved.workspace.isDemo,
        }
      : null,
    workspaces: members.map((m) => ({ id: m.workspace.id, name: m.workspace.name, isDemo: m.workspace.isDemo, role: m.role })),
    features: { googleAuth: env.googleAuthEnabled, demo: env.demoEnabled, smtp: env.smtpEnabled },
  };
}
