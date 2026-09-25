# ObserveMetrics

Centralized AI spend & usage analytics for teams. Connect OpenAI, Anthropic, Google Gemini and
Mistral accounts, and get one dashboard that answers: **which models are we using, how many tokens
is each team consuming, what does it cost by department, and are we trending over budget?**

![stack](https://img.shields.io/badge/stack-Next.js%2014%20·%20TypeScript%20·%20Postgres%20·%20Redis%20·%20Stripe-blue)

## Feature summary

- **Auth & orgs** — email/password + Google OAuth, JWT sessions (7d, httpOnly cookie), multi-tenant
  organizations with Admin/Member roles, email invitations.
- **Provider connections** — API keys encrypted at rest with **AES-256-GCM**, only the last 4
  characters ever displayed, keys verified against the provider before storage, re-enterable, removable.
- **Scheduled syncs** — a background worker (BullMQ + Redis, or interval timer) pulls each provider's
  usage/billing API every **6 hours** and stores normalized usage records.
- **Dashboards** (read from pre-aggregated daily rollups → sub-second loads):
  - **Overview** — monthly spend, daily spend trend, spend by provider (donut), spend by model (bars)
  - **Token Analytics** — tokens per model/day, stacked input vs output, provider + model tables
  - **Cost Analytics** — cost by model, cost by team, month-over-month **forecast** (3-month projection)
  - **Budgets & Alerts** — org-wide and per-team monthly budgets, progress bars, email alerts at 80% / 100%
- **Exports** — CSV for any view, PDF monthly summary (Growth plan).
- **Billing** — Stripe Checkout + customer portal for the ObserveMetrics subscription itself
  (Free / Starter $29 / Growth $149), with plan limits enforced server-side.
- **Non-functional** — multi-tenant isolation enforced at the query layer, Redis-backed rate limiting
  on sensitive endpoints, Zod validation everywhere, plan-based retention cleanup, Docker Compose
  dev stack, GitHub Actions CI, dark mode, responsive layout.

## Quick start (local)

Prerequisites: Node 20+, Docker (for Postgres + Redis).

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres + Redis
docker compose up -d

# 3. Configure environment
cp .env.example .env
# → set JWT_SECRET and ENCRYPTION_KEY (see .env.example for one-liners)

# 4. Create schema + demo data
npx prisma migrate deploy   # or: npx prisma migrate dev
npm run db:seed             # demo org, 60 days of usage

# 5. Run
npm run dev                 # web app  → http://localhost:3000
npm run worker              # background sync worker (separate terminal)
```

Log in with the seeded demo account:

```
email:    demo@observemetrics.dev
password: demo1234
```

The demo org ships with 60 days of usage across 4 simulated providers, so every chart is populated
immediately. You can also connect the **DEMO** provider on any account (no API key needed) via
Settings → Providers.

## Environment variables

See [.env.example](.env.example) for the full annotated list. The essentials:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis for BullMQ + rate limiting (optional — falls back to timers/in-memory) |
| `JWT_SECRET` | 32+ char secret signing session JWTs |
| `ENCRYPTION_KEY` | 64 hex chars (32 bytes) — AES-256-GCM key for provider API keys |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH` | Billing (optional; billing disabled when unset) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Invitation + alert emails (optional; logged to console when unset) |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth (optional) |
| `DEMO_MODE` | `true` enables the demo seeding endpoints |
| `CRON_SECRET` | Protects `/api/v1/cron/trigger-worker` on serverless deploys |

## Architecture

```
┌──────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│  Next.js app │──▶│  API routes (/api/v1) │──▶│ PostgreSQL            │
│  (dashboard) │   │  auth · analytics ·   │   │  raw usage records    │
└──────────────┘   │  providers · billing  │   │  daily/monthly rollups│
                   └──────────┬───────────┘   └──────────────────────┘
                              │ enqueue               ▲
                   ┌──────────▼───────────┐           │ writes
                   │  Redis (BullMQ)      │──▶ ┌──────┴──────────────┐
                   │  queues: sync,       │    │  Worker process      │
                   │  budgets, retention  │    │  (npm run worker)    │
                   └──────────────────────┘    │  · provider adapters │
                                               │  · budget checks     │
                                               │  · retention cleanup │
                                               └──────────────────────┘
```

- **Provider adapters** (`src/lib/providers/`) normalize each provider's usage API into
  `{ model, inputTokens, outputTokens, requests, team, timestamp }` rows.
- **Ingest** (`src/lib/sync.ts`) is idempotent: raw records are inserted and daily/monthly rollups
  upserted incrementally in a transaction. Overlapping sync windows double-count nothing.
- **Dashboards** (`src/lib/analytics.ts`) read *only* from rollup tables, so chart latency is
  independent of raw event volume. Retention deletes both raw + rollups past the plan window.
- **Tenancy**: every domain table carries `organizationId`; every query in the API layer filters by
  the caller's resolved org (`requireOrgContext`), not just the UI.

Docs: [API reference](API.md) · [Encryption design](ENCRYPTION.md) · [Deployment guide](DEPLOYMENT.md)

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run worker` | Background worker (sync every 6h, retention daily) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate:dev` | Create/apply schema in dev |
| `npm run db:migrate` | Apply migrations (prod) |
| `npm run db:seed` | Seed demo org + 60 days of usage |

## Deployment (short version)

- **Web app** → Vercel (or Railway/Render). Set env vars, run `prisma migrate deploy` as release step.
- **Worker + Redis** → Railway/Render/Fly long-running service (`npm run worker`) with the same env.
  On Vercel-only deployments, `vercel.json` crons tick `/api/v1/cron/trigger-worker` every 15 min
  instead (set `CRON_SECRET`).
- **Backups** → enable managed daily PITR backups on your Postgres host, or use the pg_dump cron in
  [DEPLOYMENT.md](DEPLOYMENT.md).
- **CI/CD** → GitHub Actions runs typecheck + build on every PR and deploys `main` to staging
  (see `.github/workflows/ci.yml`).

Full details in [DEPLOYMENT.md](DEPLOYMENT.md).

## Plan limits

| Plan | Price | Providers | Members | Retention | Budgets | Exports |
|---|---|---|---|---|---|---|
| Free | $0 | 1 | 1 | 30 days | — | — |
| Starter | $29/mo | 3 | 5 | 6 months | — | — |
| Growth | $149/mo | Unlimited | Unlimited | 1 year | ✓ | ✓ |

Limits are enforced server-side (`src/lib/plans.ts`) — the UI merely reflects them.

## Out of scope for v1 (by design)

AI router / model selection, performance & quality scoring, agency/white-label multi-client billing.

## License

MIT — see [LICENSE](LICENSE).
