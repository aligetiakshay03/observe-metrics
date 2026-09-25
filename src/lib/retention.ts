/**
 * Retention enforcement: deletes raw + rollup rows older than the org's plan
 * retention window. Runs in the worker tick; FREE keeps 30 days, STARTER 180,
 * GROWTH 365.
 */
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";

export async function runRetentionForAllOrgs(): Promise<{ orgs: number; deleted: number }> {
  const orgs = await prisma.organization.findMany({ select: { id: true, plan: true } });
  let deleted = 0;
  for (const org of orgs) {
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - planOf(org.plan).retentionDays);

    const res = await prisma.$transaction([
      prisma.usageRecord.deleteMany({
        where: { organizationId: org.id, timestamp: { lt: cutoff } },
      }),
      prisma.dailyRollup.deleteMany({
        where: { organizationId: org.id, day: { lt: cutoff } },
      }),
      prisma.monthlyRollup.deleteMany({
        where: { organizationId: org.id, month: { lt: cutoff } },
      }),
    ]);
    deleted += res.reduce((acc, r) => acc + r.count, 0);
  }
  return { orgs: orgs.length, deleted };
}
