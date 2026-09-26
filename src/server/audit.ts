import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { logger } from "./log";

const log = logger("audit");

export type AuditAction =
  | "workspace.created"
  | "workspace.updated"
  | "provider.connected"
  | "provider.updated"
  | "provider.disconnected"
  | "provider.tested"
  | "provider.sync_requested"
  | "team.created"
  | "team.updated"
  | "team.deleted"
  | "application.created"
  | "application.updated"
  | "application.deleted"
  | "member.invited"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "invite.revoked"
  | "budget.created"
  | "budget.updated"
  | "budget.deleted"
  | "ingestion_key.created"
  | "ingestion_key.revoked"
  | "settings.notifications_updated"
  | "data.exported"
  | "data.deleted"
  | "security.password_changed"
  | "security.sessions_revoked";

/**
 * Append an audit entry. Metadata must never include secrets — callers pass
 * identifiers and display values only (e.g. provider + last4).
 */
export async function audit(entry: {
  workspaceId: string;
  actorId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: entry.workspaceId,
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? undefined,
        ip: entry.ip ?? null,
      },
    });
  } catch (e) {
    // Auditing must not break the user action, but failures are visible.
    log.error("failed to write audit log", e);
  }
}
