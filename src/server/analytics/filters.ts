/**
 * Dashboard filter parsing (pure — shared by API routes, exports and tests).
 * Dates are UTC calendar days; `to` is inclusive.
 */

import type { Filters, RangeKey } from "../../lib/types";
export type { Filters, RangeKey };

const DAY = 86_400_000;
const isDay = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));

export const toDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => toDay(new Date(Date.parse(day + "T00:00:00Z") + n * DAY));
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / DAY) + 1;

const RANGE_DAYS: Record<Exclude<RangeKey, "custom">, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MODEL = /^[A-Za-z0-9._:/@-]{1,120}$/;

export function parseFilters(sp: URLSearchParams, now: Date = new Date()): Filters {
  const today = toDay(now);
  let range = (sp.get("range") ?? "30d") as RangeKey;
  let from: string;
  let to: string;
  const qFrom = sp.get("from");
  const qTo = sp.get("to");
  if (isDay(qFrom) && isDay(qTo) && qFrom <= qTo && daysBetween(qFrom, qTo) <= 731) {
    range = "custom";
    from = qFrom;
    to = qTo > today ? today : qTo;
  } else {
    if (!(range in RANGE_DAYS)) range = "30d";
    to = today;
    from = addDays(today, -(RANGE_DAYS[range as Exclude<RangeKey, "custom">] - 1));
  }
  const providers = (sp.get("provider") ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => /^[a-z0-9_-]{1,40}$/.test(p))
    .slice(0, 10);
  const team = sp.get("team");
  const app = sp.get("app");
  const model = sp.get("model");
  return {
    range,
    from,
    to,
    days: daysBetween(from, to),
    providers,
    teamId: team && ID.test(team) ? team : null,
    applicationId: app && ID.test(app) ? app : null,
    model: model && MODEL.test(model) ? model : null,
  };
}

/** The immediately preceding window of equal length (for comparisons). */
export function previousPeriod(f: Filters): Filters {
  return { ...f, from: addDays(f.from, -f.days), to: addDays(f.from, -1) };
}

export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0;
  return ((cur - prev) / prev) * 100;
}
