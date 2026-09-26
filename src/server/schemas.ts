import "server-only";
import { z } from "zod";
import { prisma } from "./db";
import { E } from "./http";

export const budgetSchema = z
  .object({
    name: z.string().trim().min(1, "Name the budget.").max(80),
    scope: z.enum(["WORKSPACE", "TEAM", "APPLICATION"]),
    teamId: z.string().max(64).nullable().optional(),
    applicationId: z.string().max(64).nullable().optional(),
    amountUsd: z.number({ invalid_type_error: "Enter an amount." }).positive("Amount must be greater than 0.").max(10_000_000),
    thresholds: z.array(z.number().int().min(1).max(200)).min(1).max(5).default([80, 100]),
    notify: z.boolean().default(true),
  })
  .refine((b) => b.scope !== "TEAM" || !!b.teamId, { path: ["teamId"], message: "Choose a team." })
  .refine((b) => b.scope !== "APPLICATION" || !!b.applicationId, { path: ["applicationId"], message: "Choose an application." });

export type BudgetInput = z.infer<typeof budgetSchema>;

export async function assertBudgetTargets(workspaceId: string, b: BudgetInput) {
  if (b.scope === "TEAM" && !(await prisma.team.findFirst({ where: { id: b.teamId!, workspaceId } }))) throw E.invalid("Team not found.", { teamId: "Team not found." });
  if (b.scope === "APPLICATION" && !(await prisma.application.findFirst({ where: { id: b.applicationId!, workspaceId } })))
    throw E.invalid("Application not found.", { applicationId: "Application not found." });
}

export function budgetData(b: BudgetInput) {
  return {
    name: b.name,
    scope: b.scope,
    teamId: b.scope === "TEAM" ? b.teamId! : null,
    applicationId: b.scope === "APPLICATION" ? b.applicationId! : null,
    amountUsd: b.amountUsd,
    thresholds: [...new Set(b.thresholds)].sort((x, y) => x - y),
    notify: b.notify,
  };
}

export const teamSchema = z.object({ name: z.string().trim().min(1, "Enter a team name.").max(80) });

export const appSchema = z.object({
  name: z.string().trim().min(1, "Enter an application name.").max(80),
  description: z.string().trim().max(300).nullable().optional(),
  teamId: z.string().max(64).nullable().optional(),
});

export async function assertTeam(workspaceId: string, teamId?: string | null) {
  if (teamId && !(await prisma.team.findFirst({ where: { id: teamId, workspaceId } }))) throw E.invalid("Team not found.", { teamId: "Team not found." });
}
