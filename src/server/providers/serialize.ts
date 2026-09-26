import type { ProviderConnection } from "@prisma/client";
import type { ConnectionInfo } from "@/lib/types";
import { maskedDisplay } from "../secrets";
import { providerIdFromEnum } from "./types";

/**
 * The only way a connection leaves the server. The ciphertext is never
 * included; the key is represented by its masked last four characters.
 */
export function serializeConnection(c: ProviderConnection): ConnectionInfo {
  return {
    id: c.id,
    provider: providerIdFromEnum(c.provider) ?? c.provider.toLowerCase(),
    name: c.name,
    maskedKey: maskedDisplay(c.keyLast4),
    status: c.status,
    syncStatus: c.syncStatus,
    lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: c.lastSyncError,
    lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
    nextSyncAt: c.nextSyncAt?.toISOString() ?? null,
    modelCount: c.modelCount,
    createdAt: c.createdAt.toISOString(),
  };
}
