# ObserveMetrics

**AI usage, cost & performance intelligence.** Track. Understand. Optimize.

ObserveMetrics answers the questions teams using several AI providers actually have: how much are we spending, on which provider, model, team and application; how many tokens; which models are fastest and least reliable; why spend went up; and where we can optimize. It combines provider usage/cost sync with an ingestion API for instrumented applications, and turns the data into explained insights, alerts and budgets.

Free during launch — there are no plans, paywalls or billing flows.

## What's in the box

| Area | Details |
|---|---|
| Dashboard | Overview, Usage, Costs (projection, waterfall, monthly), Models (compare 2–4), Teams, Applications, Requests explorer, detail pages for every model/team/app |
| Insights | Deterministic rules: `cost_anomaly`, `usage_spike`, `latency_regression`, `error_spike`, `provider_outage`, `oversized_context`, `high_cost_model`, `duplicate_requests`, `budget_threshold`. Each insight has what happened / why it matters / cause / recommendation / estimated impact / evidence / trend / related requests |
| Alerts & notifications | Alerts for cost anomalies, latency, errors, budgets and provider sync failures (read / resolve); per-user notification center with preferences; optional email |
| Budgets | Workspace, team or application budgets with 80% / 100% thresholds (configurable), projections, alerts |
| Providers | OpenAI and Anthropic (Admin keys → daily usage + provider-reported costs), Google Gemini and Mistral (key verification + models; usage via ingestion API). Common `ProviderAdapter` interface |
| Ingestion API | `POST /api/v1/events` with workspace ingestion keys — single event or batches of 500, idempotent via `request_id` |
| Workspaces | Multi-workspace users, roles Owner/Admin/Member/Viewer enforced server-side, invites, audit log |
| Demo | Per-user demo workspace ("Helix Labs") with a year of coherent generated data, clearly labelled; anonymous "View demo" via short-lived guest accounts |
| Security | AES-256-GCM credential encryption bound to the workspace, keys never returned to the browser, hashed sessions/tokens/keys, CSRF origin checks, rate limiting, CSP, CSV-injection escaping — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security) |

## Quick start (local)

Requirements: Node 20+, Docker (for Postgres/Redis) or your own PostgreSQL 14+.

```bash
docker compose up -d                       # Postgres on :55432, Redis on :56379
cp .env.example .env                       # then set ENCRYPTION_KEY (see below)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → ENCRYPTION_KEY
npm install
npm run db:migrate                         # applies prisma/migrations
npm run dev                                # http://localhost:3100
npm run worker                             # optional: scheduled syncs + insight refresh
```

Open http://localhost:3100 and **Start free**, or click **View demo** to explore without an account.

Without SMTP configured, password-reset and invitation links are printed to the dev-server console (and returned once in the invite response) so every flow works locally.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server on port 3100 |
| `npm run build` / `npm start` | Production build / server |
| `npm run worker` | Calls `/api/v1/cron/tick` every `WORKER_INTERVAL_SECONDS` (default 300) |
| `npm test` | Unit + integration tests (uses `TEST_DATABASE_URL`, migrated automatically) |
| `npm run typecheck` | TypeScript |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |

Integration tests need an empty database: `docker exec observe-metrics-postgres psql -U postgres -c "CREATE DATABASE observe_metrics_test"`.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `APP_URL` | yes | Public base URL. Must be `https://` in production |
| `DATABASE_URL` | yes | PostgreSQL |
| `ENCRYPTION_KEY` | prod | 64 hex chars. Encrypts provider credentials. Losing it makes stored keys unrecoverable |
| `ENCRYPTION_KEY_PREVIOUS` | no | Old key during rotation |
| `CRON_SECRET` | prod | Bearer secret for `/api/v1/cron/tick` (24+ chars) |
| `REDIS_URL` | no | Shared rate limiting across instances (falls back to in-memory) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | no | Password reset, invites, alert emails |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Enables "Continue with Google" (hidden otherwise) |
| `DEMO_MODE` | no | `false` disables demo workspaces |
| `TRUSTED_PROXY_HOPS` | no | Number of proxies appending to `X-Forwarded-For` (default 1) |
| `WORKER_INTERVAL_SECONDS` | no | Worker tick interval |
| `TEST_DATABASE_URL` | tests | Database used by `npm test` |

In production the API refuses to serve (and logs why) if `ENCRYPTION_KEY`, `APP_URL` or `CRON_SECRET` are missing or insecure.

## Deploying

Any Node host with PostgreSQL works:

1. Provision Postgres, set the environment variables above.
2. `npm ci && npm run db:migrate && npm run build && npm start`.
3. Schedule the tick: run `npm run worker` as a separate process, **or** use a platform cron hitting `POST /api/v1/cron/tick` with `Authorization: Bearer $CRON_SECRET` (`vercel.json` configures a 15-minute Vercel Cron, which sends the header automatically when `CRON_SECRET` is set).
4. Put the app behind HTTPS (HSTS is sent in production).

## Project layout

```
prisma/                  schema + migrations (0_init … 3_owner_backfill)
src/server/              server-only code
  auth/                  password hashing, DB sessions, workspace/role context
  providers/             ProviderAdapter + openai / anthropic / google / mistral
  ingest/                ingestion API, dimension resolution, daily rollup rebuild
  sync/                  Postgres-backed job queue + sync engine
  analytics/             filters, aggregation, page view models
  insights/              deterministic rules + runner (alerts, notifications)
  pricing/               model price catalog + ModelPricingService
  demo/                  demo dataset generator + seeding
  secrets.ts, log.ts     encryption, redacting logger
src/app/api/v1/          route handlers
src/app/                 landing, auth, onboarding, docs, dashboard
src/components/          design system, charts, shell
worker/index.mjs         scheduler process
tests/                   vitest unit + integration tests
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). User-facing docs live in the app at `/docs`.
