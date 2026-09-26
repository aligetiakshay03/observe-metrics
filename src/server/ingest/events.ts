import "server-only";
import { z } from "zod";
import { prisma } from "../db";
import { E } from "../http";
import { calculateCost, normalizeModelId, normalizeProviderId } from "../pricing/service";
import { randomToken, sha256 } from "../secrets";
import { DimensionResolver } from "./dimensions";
import { rebuildDailyUsage, utcDay } from "./rollup";

const ref = z.string().trim().min(1).max(80);

export const ingestEventSchema = z
  .object({
    provider: z.string().trim().min(1).max(40),
    model: z.string().trim().min(1).max(120),
    application: ref.optional(),
    team: ref.optional(),
    user: z.string().trim().min(1).max(120).optional(),
    input_tokens: z.number().int().min(0).max(50_000_000),
    output_tokens: z.number().int().min(0).max(50_000_000),
    cached_tokens: z.number().int().min(0).max(50_000_000).optional(),
    latency_ms: z.number().min(0).max(3_600_000).optional(),
    status: z.enum(["success", "error"]).default("success"),
    error_code: z.string().trim().max(80).optional(),
    timestamp: z.string().datetime({ offset: true }).optional(),
    request_id: z.string().trim().min(1).max(200).optional(),
    prompt_hash: z
      .string()
      .regex(/^[A-Za-z0-9_\-:]{8,128}$/, "Use a hex/base64url hash of the prompt, 8–128 chars.")
      .optional(),
    cost_usd: z.number().min(0).max(100_000).optional(),
  })
  .strict();

export const ingestBodySchema = z.union([
  ingestEventSchema,
  z.object({ events: z.array(ingestEventSchema).min(1).max(500) }).strict(),
]);

export type IngestEvent = z.infer<typeof ingestEventSchema>;

const MAX_PAST_MS = 35 * 86_400_000;
const MAX_FUTURE_MS = 5 * 60_000;

export async function ingestEvents(workspaceId: string, events: IngestEvent[]): Promise<{ accepted: number; duplicates: number }> {
  const now = Date.now();
  const resolver = new DimensionResolver(workspaceId);
  const rows = [];
  for (const [i, e] of events.entries()) {
    const ts = e.timestamp ? new Date(e.timestamp) : new Date(now);
    if (ts.getTime() < now - MAX_PAST_MS || ts.getTime() > now + MAX_FUTURE_MS) {
      throw E.invalid(`events[${i}].timestamp must be within the last 35 days.`, { [`events.${i}.timestamp`]: "Out of range" });
    }
    const provider = normalizeProviderId(e.provider);
    const model = normalizeModelId(e.model);
    const teamId = await resolver.team(e.team);
    const applicationId = await resolver.application(e.application, teamId);
    const cached = Math.min(e.cached_tokens ?? 0, e.input_tokens);
    const calc = calculateCost({ provider, model, inputTokens: e.input_tokens, outputTokens: e.output_tokens, cachedTokens: cached, at: ts });
    const reported = e.cost_usd != null;
    rows.push({
      workspaceId,
      source: "INGEST_API" as const,
      provider,
      model,
      applicationId,
      teamId,
      userRef: e.user ?? null,
      timestamp: ts,
      requestCount: 1,
      errorCount: e.status === "error" ? 1 : 0,
      inputTokens: BigInt(e.input_tokens),
      outputTokens: BigInt(e.output_tokens),
      cachedTokens: BigInt(cached),
      costUsd: reported ? e.cost_usd! : calc.costUsd,
      costSource: reported ? ("PROVIDER_REPORTED" as const) : ("CALCULATED" as const),
      latencyMsSum: e.latency_ms ?? null,
      status: e.status,
      errorCode: e.error_code ?? null,
      requestId: e.request_id ?? null,
      promptHash: e.prompt_hash ?? null,
      // request_id makes retries idempotent; otherwise each event is unique.
      dedupeKey: e.request_id ? "req:" + sha256(e.request_id).slice(0, 40) : "evt:" + randomToken(16),
    });
  }
  const res = await prisma.usageEvent.createMany({ data: rows, skipDuplicates: true });
  await rebuildDailyUsage(workspaceId, rows.map((r) => utcDay(r.timestamp)));
  return { accepted: res.count, duplicates: rows.length - res.count };
}

// ── Ingestion keys ──

export const INGEST_KEY_PREFIX = "om_ingest_";

export function generateIngestionKey(): { raw: string; hash: string; prefix: string } {
  const raw = INGEST_KEY_PREFIX + randomToken(24);
  return { raw, hash: sha256(raw), prefix: raw.slice(0, INGEST_KEY_PREFIX.length + 6) };
}

export async function authenticateIngestionKey(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match || !match[1]!.startsWith(INGEST_KEY_PREFIX)) {
    throw E.unauthorized();
  }
  const key = await prisma.ingestionKey.findUnique({ where: { keyHash: sha256(match[1]!) } });
  if (!key || key.revokedAt) throw E.unauthorized();
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    await prisma.ingestionKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return key;
}
