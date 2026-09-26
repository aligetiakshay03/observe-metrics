import { ok, parseBody, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { authenticateIngestionKey, ingestBodySchema, ingestEvents } from "@/server/ingest/events";

/**
 * POST /api/v1/events — usage ingestion for instrumented applications.
 * Auth: `Authorization: Bearer om_ingest_…` (workspace ingestion key).
 * Body: a single event or `{ "events": [...] }` (max 500). See /docs/sdk.
 * Session cookies are ignored here; this endpoint is CSRF-exempt because it
 * only accepts bearer credentials.
 */
export const POST = route(async (req) => {
  const key = await authenticateIngestionKey(req);
  await enforceRateLimit(`ingest:${key.id}`, 600, 60, "Ingestion rate limit exceeded (600 requests/minute per key).");
  const body = await parseBody(req, ingestBodySchema);
  const events = "events" in body ? body.events : [body];
  const result = await ingestEvents(key.workspaceId, events);
  return ok(result, { status: 202 });
});

export const dynamic = "force-dynamic";
