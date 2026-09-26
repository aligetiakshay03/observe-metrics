import "server-only";
import { prisma } from "./db";
import { prettyModel, providerLabel } from "@/lib/format";
import type { SearchResult } from "@/lib/types";

const PAGES: SearchResult[] = [
  { type: "page", id: "overview", title: "Overview", subtitle: "Dashboard", href: "/dashboard" },
  { type: "page", id: "usage", title: "Usage", subtitle: "Tokens and requests", href: "/dashboard/usage" },
  { type: "page", id: "costs", title: "Costs", subtitle: "Spend and forecast", href: "/dashboard/costs" },
  { type: "page", id: "models", title: "Models", subtitle: "Compare models", href: "/dashboard/models" },
  { type: "page", id: "teams", title: "Teams", subtitle: "Attribution", href: "/dashboard/teams" },
  { type: "page", id: "apps", title: "Applications", subtitle: "Attribution", href: "/dashboard/applications" },
  { type: "page", id: "budgets", title: "Budgets", subtitle: "Limits and thresholds", href: "/dashboard/budgets" },
  { type: "page", id: "alerts", title: "Alerts", subtitle: "Needs attention", href: "/dashboard/alerts" },
  { type: "page", id: "insights", title: "Insights", subtitle: "Anomalies and optimizations", href: "/dashboard/insights" },
  { type: "page", id: "requests", title: "Requests", subtitle: "Event explorer", href: "/dashboard/requests" },
  { type: "page", id: "providers", title: "Providers", subtitle: "Settings", href: "/dashboard/settings/providers" },
  { type: "page", id: "settings", title: "Settings", subtitle: "Workspace", href: "/dashboard/settings" },
];

export async function search(workspaceId: string, q: string): Promise<SearchResult[]> {
  const query = q.trim().slice(0, 80);
  if (!query) return PAGES.slice(0, 6);
  const like = { contains: query, mode: "insensitive" as const };
  const [teams, apps, models, users, members, insights] = await Promise.all([
    prisma.team.findMany({ where: { workspaceId, name: like }, take: 5 }),
    prisma.application.findMany({ where: { workspaceId, name: like }, take: 5 }),
    prisma.dailyUsage.findMany({ where: { workspaceId, model: like }, distinct: ["provider", "model"], select: { provider: true, model: true }, take: 6 }),
    prisma.usageEvent.findMany({ where: { workspaceId, userRef: like }, distinct: ["userRef"], select: { userRef: true, teamId: true }, take: 5 }),
    prisma.workspaceMember.findMany({
      where: { workspaceId, user: { OR: [{ name: like }, { email: like }] } },
      include: { user: { select: { name: true, email: true } } },
      take: 5,
    }),
    prisma.insight.findMany({ where: { workspaceId, title: like }, orderBy: { detectedAt: "desc" }, take: 5 }),
  ]);
  const needle = query.toLowerCase();
  return [
    ...PAGES.filter((p) => p.title.toLowerCase().includes(needle)),
    ...models.map((m) => ({
      type: "model" as const,
      id: `${m.provider}:${m.model}`,
      title: prettyModel(m.model),
      subtitle: `${providerLabel(m.provider)} · ${m.model}`,
      href: `/dashboard/models/${encodeURIComponent(m.provider)}/${encodeURIComponent(m.model)}`,
    })),
    ...teams.map((t) => ({ type: "team" as const, id: t.id, title: t.name, subtitle: "Team", href: `/dashboard/teams/${t.id}` })),
    ...apps.map((a) => ({ type: "application" as const, id: a.id, title: a.name, subtitle: "Application", href: `/dashboard/applications/${a.id}` })),
    ...insights.map((i) => ({ type: "insight" as const, id: i.id, title: i.title, subtitle: `Insight · ${i.severity.toLowerCase()}`, href: `/dashboard/insights/${i.id}` })),
    ...members.map((m) => ({ type: "user" as const, id: m.id, title: m.user.name ?? m.user.email, subtitle: `Member · ${m.role.toLowerCase()}`, href: "/dashboard/settings/team" })),
    ...users
      .filter((u) => u.userRef)
      .map((u) => ({
        type: "user" as const,
        id: u.userRef!,
        title: u.userRef!,
        subtitle: "User activity",
        href: `/dashboard/requests?user=${encodeURIComponent(u.userRef!)}`,
      })),
  ].slice(0, 20);
}
