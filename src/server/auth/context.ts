import "server-only";
import type { MemberRole, Session, User, Workspace, WorkspaceMember } from "@prisma/client";
import { prisma } from "../db";
import { E } from "../http";
import { readCookie, SESSION_COOKIE, validateSessionToken, WORKSPACE_COOKIE } from "./session";

const RANK: Record<MemberRole, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function roleAtLeast(role: MemberRole, min: MemberRole): boolean {
  return RANK[role] >= RANK[min];
}

export interface AuthContext {
  user: User;
  session: Session;
}

export interface WorkspaceContext extends AuthContext {
  workspace: Workspace;
  member: WorkspaceMember;
  role: MemberRole;
}

export async function getAuth(req: Request): Promise<AuthContext | null> {
  return validateSessionToken(readCookie(req, SESSION_COOKIE));
}

export async function requireUser(req: Request): Promise<AuthContext> {
  const auth = await getAuth(req);
  if (!auth) throw E.unauthorized();
  return auth;
}

/**
 * Resolve the caller's active workspace and enforce a minimum role.
 * The workspace id comes from an httpOnly cookie but is *always* checked
 * against the caller's memberships, so tampering yields their default
 * workspace or a 403 — never another tenant's data.
 */
export async function resolveWorkspace(user: User, requestedId: string | null): Promise<{ workspace: Workspace; member: WorkspaceMember } | null> {
  if (requestedId) {
    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: requestedId } },
      include: { workspace: true },
    });
    if (member) {
      const { workspace, ...m } = member;
      return { workspace, member: m as WorkspaceMember };
    }
  }
  // Default: the user's first non-demo workspace, then any workspace.
  const members = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  const pick = members.find((m) => !m.workspace.isDemo) ?? members[0];
  if (!pick) return null;
  const { workspace, ...m } = pick;
  return { workspace, member: m as WorkspaceMember };
}

export async function requireWorkspace(req: Request, minRole: MemberRole = "VIEWER"): Promise<WorkspaceContext> {
  const auth = await requireUser(req);
  const resolved = await resolveWorkspace(auth.user, readCookie(req, WORKSPACE_COOKIE));
  if (!resolved) throw E.forbidden("Create a workspace to continue.");
  if (!roleAtLeast(resolved.member.role, minRole)) throw E.forbidden();
  return { ...auth, ...resolved, role: resolved.member.role };
}

/** Guest (anonymous demo) users can explore but not connect real systems. */
export function assertNotGuest(ctx: AuthContext, action = "do this") {
  if (ctx.user.isGuest) throw E.forbidden(`Create a free account to ${action}.`);
}

/** Demo workspaces hold generated data only — no real credentials go there. */
export function assertNotDemo(ctx: WorkspaceContext, action = "do this") {
  if (ctx.workspace.isDemo) throw E.forbidden(`Switch to your own workspace to ${action}. The demo workspace only contains sample data.`);
}
