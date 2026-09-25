/** Coerce Prisma bigint/number aggregates to a JS number. */
export function num(v: bigint | number | null | undefined): number {
  return typeof v === "bigint" ? Number(v) : Number(v ?? 0);
}
