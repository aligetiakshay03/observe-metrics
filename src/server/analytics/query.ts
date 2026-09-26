import "server-only";
import { Prisma } from "@prisma/client";
import { prisma, num } from "../db";
import type { Filters } from "./filters";

export type Dim = "day" | "month" | "provider" | "model" | "team" | "app";

const DIM_SQL: Record<Dim, Prisma.Sql> = {
  day: Prisma.sql`to_char("day", 'YYYY-MM-DD')`,
  month: Prisma.sql`to_char(date_trunc('month', "day"), 'YYYY-MM')`,
  provider: Prisma.sql`"provider"`,
  model: Prisma.sql`"model"`,
  team: Prisma.sql`"teamId"`,
  app: Prisma.sql`"applicationId"`,
};

export interface Agg {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  costUsd: number;
  reportedCostUsd: number;
  latencyMs: number | null; // weighted average over requests with latency
  latencyCount: number;
  errorRate: number; // 0..1
}

export type AggRow = Agg & { keys: Partial<Record<Dim, string>> };

export const EMPTY_AGG: Agg = {
  requests: 0,
  errors: 0,
  inputTokens: 0,
  outputTokens: 0,
  tokens: 0,
  costUsd: 0,
  reportedCostUsd: 0,
  latencyMs: null,
  latencyCount: 0,
  errorRate: 0,
};

function where(workspaceId: string, f: Pick<Filters, "from" | "to" | "providers" | "teamId" | "applicationId" | "model">): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`"workspaceId" = ${workspaceId}`,
    Prisma.sql`"day" >= ${f.from}::date`,
    Prisma.sql`"day" <= ${f.to}::date`,
  ];
  if (f.providers.length) parts.push(Prisma.sql`"provider" IN (${Prisma.join(f.providers)})`);
  if (f.teamId) parts.push(Prisma.sql`"teamId" = ${f.teamId}`);
  if (f.applicationId) parts.push(Prisma.sql`"applicationId" = ${f.applicationId}`);
  if (f.model) parts.push(Prisma.sql`"model" = ${f.model}`);
  return Prisma.join(parts, " AND ");
}

interface RawRow {
  [k: string]: unknown;
  requests: bigint | number;
  errors: bigint | number;
  input: bigint | number;
  output: bigint | number;
  cost: number;
  reported: number;
  latsum: number;
  latcount: bigint | number;
}

function toAgg(r: RawRow): Agg {
  const requests = num(r.requests);
  const errors = num(r.errors);
  const inputTokens = num(r.input);
  const outputTokens = num(r.output);
  const latencyCount = num(r.latcount);
  return {
    requests,
    errors,
    inputTokens,
    outputTokens,
    tokens: inputTokens + outputTokens,
    costUsd: num(r.cost),
    reportedCostUsd: num(r.reported),
    latencyMs: latencyCount > 0 ? num(r.latsum) / latencyCount : null,
    latencyCount,
    errorRate: requests > 0 ? errors / requests : 0,
  };
}

/** Aggregate daily_usage for the workspace, grouped by zero or more dimensions. */
export async function aggregate(workspaceId: string, f: Filters, dims: Dim[] = []): Promise<AggRow[]> {
  const select = dims.map((d) => Prisma.sql`${DIM_SQL[d]} AS "k_${Prisma.raw(d)}"`);
  const groupBy = dims.length ? Prisma.sql`GROUP BY ${Prisma.join(dims.map((_, i) => Prisma.raw(String(i + 1))))}` : Prisma.empty;
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT ${select.length ? Prisma.sql`${Prisma.join(select)},` : Prisma.empty}
      COALESCE(SUM("requests"),0) AS requests, COALESCE(SUM("errors"),0) AS errors,
      COALESCE(SUM("inputTokens"),0) AS input, COALESCE(SUM("outputTokens"),0) AS output,
      COALESCE(SUM("costUsd"),0)::float8 AS cost, COALESCE(SUM("reportedCostUsd"),0)::float8 AS reported,
      COALESCE(SUM("latencyMsSum"),0)::float8 AS latsum, COALESCE(SUM("latencyCount"),0) AS latcount
    FROM "daily_usage"
    WHERE ${where(workspaceId, f)}
    ${groupBy}`;
  return rows.map((r) => {
    const keys: Partial<Record<Dim, string>> = {};
    for (const d of dims) keys[d] = String(r[`k_${d}`] ?? "");
    return { ...toAgg(r), keys };
  });
}

export async function totals(workspaceId: string, f: Filters): Promise<Agg> {
  const [row] = await aggregate(workspaceId, f, []);
  return row ?? { ...EMPTY_AGG };
}

/** Dense daily series (missing days filled with zeros) for charts. */
export function densify(rows: AggRow[], from: string, to: string): (Agg & { day: string })[] {
  const byDay = new Map(rows.map((r) => [r.keys.day!, r]));
  const out: (Agg & { day: string })[] = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    const r = byDay.get(day);
    out.push({ day, ...(r ? stripKeys(r) : EMPTY_AGG) });
  }
  return out;
}

function stripKeys(r: AggRow): Agg {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { keys, ...rest } = r;
  return rest;
}

export async function hasAnyUsage(workspaceId: string): Promise<boolean> {
  const row = await prisma.dailyUsage.findFirst({ where: { workspaceId }, select: { day: true } });
  return !!row;
}
