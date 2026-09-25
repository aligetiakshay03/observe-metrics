import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken } from "@/lib/jwt";
import type { MemberRole, Organization, User } from "@prisma/client";

export const SESSION_COOKIE = "om_session";

/** Current user (from JWT cookie) or null. */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  return prisma.user.findUnique({ where: { id: payload.userId } });
}

/** Resolve the active organization (X-Org-Id header, else first membership). */
export async function resolveActiveOrg(
  user: User,
  requestedOrgId?: string | null,
): Promise<Organization | null> {
  if (requestedOrgId) {
    const m = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: requestedOrgId } },
      include: { organization: true },
    });
    return m?.organization ?? null;
  }
  const first = await prisma.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });
  return first?.organization ?? null;
}

export interface AuthedContext {
  user: User;
  org: Organization;
  role: MemberRole;
  membershipId: string;
}

/**
 * Full auth context for org-scoped endpoints. Enforces that the caller is a
 * member of the org — tenancy is enforced here and in every query that follows.
 */
export async function requireOrgContext(
  req: Request,
): Promise<AuthedContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const url = new URL(req.url);
  let orgId = req.headers.get("x-org-id") || url.searchParams.get("orgId");
  if (!orgId) {
    // Try the cookie set by the dashboard session helper.
    orgId = (await cookies()).get("om_active_org")?.value ?? null;
  }

  const org = await resolveActiveOrg(user, orgId);
  if (!org) return null;

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
  });
  if (!membership) return null;

  return { user, org, role: membership.role, membershipId: membership.id };
}

/** Admin-only guard for member/invite/budget management. */
export function requireAdmin(ctx: AuthedContext): boolean {
  return ctx.role === "ADMIN";
}
