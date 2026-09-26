# Architecture

## Data flow

```
Provider API ──► ProviderAdapter ──► normalizeUsage() ──┐
                 (validate, fetchUsage,                  │   usage_events  ──► rebuildDailyUsage() ──► daily_usage ──► analytics views
                  fetchCosts, fetchModels)               ├─► (normalized,      (delete + INSERT…SELECT            (aggregate by day,
Instrumented app ──► POST /api/v1/events ───────────────┘    idempotent)       per affected UTC day)              provider, model, team, app)
                                                                                      │
                                                                                      └─► insight rules ──► insights ──► alerts ──► notifications (+ email)
```

- **`usage_events`** is the normalized record. A row is either one instrumented request (`requestCount = 1`, latency, status, prompt hash) or a provider-reported daily bucket per model. Provider is a string, so new providers need no schema change. `dedupeKey` (unique per workspace) makes both paths idempotent: provider buckets are *replaced* on re-sync (`sync:<connection>:<day>:<model>`) and client events dedupe on `request_id`.
- **`daily_usage`** is rebuilt from events for each affected day inside a transaction holding a per-workspace advisory lock. Aggregates are never incremented in place, so overlapping syncs and retries can't double count. Dashboards read only this table.
- **Costs** carry a source: `PROVIDER_REPORTED` (OpenAI Costs API, Anthropic cost report, or `cost_usd` sent by the client) or `CALCULATED` (tokens × `ModelPricingService` list price, dated with `effectiveFrom/To`). Unknown models are stored as unpriced (cost 0), never guessed. The UI labels every page Provider reported / Estimated / Reported + estimated / Demo data.

## Providers

`src/server/providers/types.ts` defines `ProviderAdapter`: `validateCredentials`, `fetchModels`, `fetchUsage`, `fetchCosts`, `normalizeUsage`, `getProviderStatus`, plus capability flags. `providerFetch` maps HTTP failures to typed codes (`invalid_credentials`, `insufficient_permissions`, `rate_limited`, `unavailable`, `network`, …) with user-safe messages and never includes response bodies (some providers echo part of the key).

| Provider | Credential | Reads |
|---|---|---|
| OpenAI | Admin key | `/v1/organization/usage/completions` (group_by=model, 1d) + `/v1/organization/costs` (group_by=line_item) |
| Anthropic | Admin key | `/v1/organizations/usage_report/messages` (group_by=model, 1d) + `/v1/organizations/cost_report` (amounts in cents). No request counts |
| Google Gemini | API key | key verification + model list; no usage-history API → use the ingestion API |
| Mistral | API key | key verification + model list; no usage-history API → use the ingestion API |

Adding a provider: implement the interface, register it in `registry.ts`, add the enum value to `Provider` in `schema.prisma`.

## Sync & scheduling

`sync_jobs` is a Postgres job queue. Jobs are claimed with `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`, so several workers and inline "Sync now" requests never double-process. The first sync backfills 30 days; later syncs re-read a 3-day overlap because providers finalize late. Retryable failures (429, 5xx, network) back off 2 → 4 → 8 minutes over up to 3 attempts. Credential failures mark the connection `ERROR` and raise a provider-sync alert (resolved automatically on the next success). Jobs stuck `RUNNING` for 15 minutes are re-queued.

`POST /api/v1/cron/tick` enqueues due connections (every 6h), drains up to 10 jobs, refreshes insights for workspaces with recent usage, and cleans expired sessions, tokens and 48-hour-old guest accounts. It's driven by `worker/index.mjs` or a platform cron.

## Insights

`src/server/insights/rules.ts` holds pure functions over daily aggregates. The current window is the 7 complete days ending yesterday; the baseline is the 14 days before it, normalized to 7 days. Each draft carries evidence metrics, a trend series and an estimated monthly impact, and is upserted by a fingerprint (type + subject + ISO week) so repeated runs update rather than duplicate, and user status changes (resolved/dismissed) stick. There's no ML. The engine is structured so AI-written explanations could later be added as a separate field without changing detection.

## Multi-tenancy & roles

Every workspace-owned table has `workspaceId`. Route handlers get the workspace only from `requireWorkspace()`, which validates the session and checks membership of the workspace named in the httpOnly `om_ws` cookie. A forged cookie falls back to the user's own workspace, and foreign ids return 404. Every query filters by that workspace id (`findFirst({ where: { id, workspaceId } })` / `updateMany`), so ids from the URL can't reach another tenant. Roles: Viewer (read) < Member (alerts, insights status, exports) < Admin (providers, budgets, teams/apps, keys, invites, settings) < Owner (role changes for admins/owners, delete workspace). The last owner can't be demoted or leave.

## Security

- **Passwords**: bcrypt cost 12, policy ≥ 10 chars with a letter and a number, timing-equalized for unknown emails; generic "incorrect email or password".
- **Sessions**: random 256-bit token in an `HttpOnly; SameSite=Lax; Secure (prod)` cookie. Only the SHA-256 hash is stored. Sign-out deletes the row; password change or reset revokes other sessions. "Remember me" gives a 30-day sliding expiry; otherwise it's a browser-session cookie with a 24h server expiry.
- **Password reset**: single-use hashed token, 1 hour. Same response whether or not the email exists.
- **Provider credentials**: AES-256-GCM, random IV, workspace id as AAD (a ciphertext copied to another workspace fails to decrypt), key id in the envelope for rotation (`ENCRYPTION_KEY_PREVIOUS`). The plaintext exists only in memory during validation or sync. It is never returned to the browser (masked as `••••abcd`), never logged, and never put in URLs. Demo workspaces and guest accounts can't store credentials.
- **Ingestion & invite tokens**: stored as SHA-256 hashes; ingestion keys are shown once.
- **CSRF**: SameSite=Lax cookies, plus middleware rejecting state-changing `/api` requests whose `Origin` (or `Sec-Fetch-Site`) isn't same-origin. Bearer-authenticated endpoints (`/api/v1/events`, cron) are exempt.
- **Rate limiting**: sign-in (per IP and per email), sign-up, password reset, provider tests and connects, invites, exports, search, ingestion (600/min/key), demo guests. Uses Redis when configured. The client IP is the right-most `X-Forwarded-For` hop.
- **Input**: zod validation on every body (strict for ingestion), 1 MB body cap, filter parameters whitelisted, parameterized SQL only (`Prisma.sql`).
- **Output**: React escaping, escaped email templates, CSV cells starting with `= + - @` prefixed to prevent formula injection, generic 500s (details go to the redacting logger).
- **Headers**: CSP (self only, `frame-ancestors 'none'`), HSTS in production, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, and `Permissions-Policy`.
- **Logging**: `src/server/log.ts` redacts provider keys, bearer tokens, ingestion keys, private keys and `api_key/password/token` fields.
- **Audit log**: provider connect/test/disconnect/sync, key create/revoke, member invite/join/role/remove, budget/team/app changes, exports, data deletion, password and session events — viewable in Settings → Security.

Known limits: the CSP allows `'unsafe-inline'` scripts (needed for the pre-paint theme script and Next's inline runtime without nonces). Rate limits are per-instance without Redis.
