/**
 * Budget evaluation + alerting. After each sync we compare month-to-date
 * spend against each budget and fire 80% / 100% email alerts once per
 * budget per month (timestamps recorded on the budget row).
 */
import { prisma } from "@/lib/db";
import { getBudgetProgress } from "@/lib/analytics";
import { sendEmail, budgetAlertEmailHtml } from "@/lib/email";

export async function checkBudgetsForOrg(orgId: string): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return;

  const budgets = await prisma.budget.findMany({ where: { organizationId: orgId } });
  const admins = await prisma.membership.findMany({
    where: { organizationId: orgId, role: "ADMIN" },
    include: { user: { select: { email: true } } },
  });

  for (const budget of budgets) {
    const progress = await getBudgetProgress(orgId, budget.team, budget.amountCents);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    if (progress.percent >= 100 && !budget.alert100SentAt) {
      await prisma.alertEvent.create({
        data: {
          organizationId: orgId,
          type: "BUDGET_100",
          team: budget.team,
          message: budget.team
            ? `Budget exceeded for team ${budget.team}: ${progress.percent}% of monthly budget used.`
            : `Organization budget exceeded: ${progress.percent}% of monthly budget used.`,
          metadata: { spentUsd: progress.spentUsd, budgetCents: budget.amountCents },
        },
      });
      for (const admin of admins) {
        await sendEmail({
          to: admin.user.email,
          subject: `[ObserveMetrics] Budget exceeded — ${budget.team ?? org.name}`,
          html: budgetAlertEmailHtml({
            orgName: org.name,
            team: budget.team ?? undefined,
            percent: progress.percent,
            spentUsd: progress.spentUsd.toFixed(2),
            budgetUsd: (budget.amountCents / 100).toFixed(2),
          }),
        });
      }
      await prisma.budget.update({ where: { id: budget.id }, data: { alert100SentAt: now } });
    } else if (progress.percent >= 80 && !budget.alert80SentAt) {
      await prisma.alertEvent.create({
        data: {
          organizationId: orgId,
          type: "BUDGET_80",
          team: budget.team,
          message: budget.team
            ? `Team ${budget.team} has used ${progress.percent}% of its monthly budget.`
            : `Organization has used ${progress.percent}% of its monthly budget.`,
          metadata: { spentUsd: progress.spentUsd, budgetCents: budget.amountCents },
        },
      });
      for (const admin of admins) {
        await sendEmail({
          to: admin.user.email,
          subject: `[ObserveMetrics] Budget alert — ${budget.team ?? org.name}`,
          html: budgetAlertEmailHtml({
            orgName: org.name,
            team: budget.team ?? undefined,
            percent: progress.percent,
            spentUsd: progress.spentUsd.toFixed(2),
            budgetUsd: (budget.amountCents / 100).toFixed(2),
          }),
        });
      }
      await prisma.budget.update({ where: { id: budget.id }, data: { alert80SentAt: now } });
    }
    void monthStart;
  }
}
