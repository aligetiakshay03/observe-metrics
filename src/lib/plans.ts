/**
 * Plan definitions and limit enforcement helpers.
 * Free: 1 provider, 1 member, 30-day retention. No budgets/exports/billing.
 * Starter: 3 providers, 5 members, 6-month retention.
 * Growth: unlimited providers/members, budgets+alerts, exports.
 */
export type PlanId = "FREE" | "STARTER" | "GROWTH";

export interface PlanLimits {
  id: PlanId;
  name: string;
  priceMonthly: number; // USD cents
  maxProviders: number; // -1 = unlimited
  maxMembers: number; // -1 = unlimited
  retentionDays: number;
  budgets: boolean;
  exports: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, PlanLimits> = {
  FREE: {
    id: "FREE",
    name: "Free",
    priceMonthly: 0,
    maxProviders: 1,
    maxMembers: 1,
    retentionDays: 30,
    budgets: false,
    exports: false,
    features: [
      "1 provider connection",
      "1 team member",
      "30-day data retention",
      "Overview dashboard",
    ],
  },
  STARTER: {
    id: "STARTER",
    name: "Starter",
    priceMonthly: 2900,
    maxProviders: 3,
    maxMembers: 5,
    retentionDays: 180,
    budgets: false,
    exports: false,
    features: [
      "3 provider connections",
      "Up to 5 team members",
      "6-month data retention",
      "Token & cost analytics",
      "30-day retention + 6 months on Starter",
    ],
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    priceMonthly: 14900,
    maxProviders: -1,
    maxMembers: -1,
    retentionDays: 365,
    budgets: true,
    exports: true,
    features: [
      "Unlimited providers & team members",
      "Budgets & email alerts",
      "CSV / PDF export",
      "1-year data retention",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["FREE", "STARTER", "GROWTH"];

export function planOf(plan: string | null | undefined): PlanLimits {
  return PLANS[(plan as PlanId) ?? "FREE"] ?? PLANS.FREE;
}
