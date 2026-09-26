import "server-only";
import { PrismaClient } from "@prisma/client";

// Reuse one Prisma instance across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Coerce Prisma bigint/number/Decimal aggregates to a JS number. */
export function num(v: bigint | number | null | undefined | { toString(): string }): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return Number(v.toString());
}
