# Deploying ObserveMetrics

Recommended low-cost layout (matches the brief: Vercel frontend + Railway backend/DB):

| Component | Service | Notes |
|---|---|---|
| Web app | **Vercel** (Hobby $0 or Pro) | Next.js app + API routes |
| PostgreSQL | **Railway** / Neon / Supabase | Enable daily backups + PITR |
| Redis + Worker | **Railway** (two services) | `redis:7` image + `npm run worker` |
| Stripe webhook | — | `https://<your-app>/api/v1/billing/webhook` |

Total hosting cost on these tiers: roughly **$5–20/mo**.

## 1. Database

```bash
# Railway → New Project → Provision PostgreSQL → copy DATABASE_URL
npx prisma migrate deploy
```

Enable **Backups → daily** (Railway/Neon both support PITR on paid tiers). For a manual
backup cron on any host with pg_dump:

```bash
# crontab — nightly 03:00 UTC, keep 14 days
0 3 * * * pg_dump "$DATABASE_URL" | gzip > /backups/om-$(date -u +\%Y\%m\%d).sql.gz
0 4 * * * find /backups -name 'om-*.sql.gz' -mtime +14 -delete
```

## 2. Web app (Vercel)

1. Import the GitHub repo into Vercel.
2. Set environment variables (all of them from `.env.example`; `APP_URL` = your prod URL).
3. Deploy. Add your domain. Done — `vercel.json` already registers the 15-minute cron that calls
   `/api/v1/cron/trigger-worker` (set `CRON_SECRET` env var to protect it).

> **Serverless note:** with Vercel-only deploys there is no long-running worker; the cron tick
> performs the same sync + budget + retention work inline. If your provider usage volume makes a
> 15-minute tick slow, add the dedicated worker below and remove the cron.

## 3. Worker + Redis (Railway)

1. **Redis**: New → Docker image `redis:7`, copy the internal URL into both services' `REDIS_URL`.
2. **Worker**: New → GitHub repo, service root `/`, start command `npm run worker`.
   Copy the same env vars as the web app. The worker runs syncs every 6 hours (and immediately
   processes queued jobs when BullMQ + Redis are connected).

## 4. Stripe

1. Create products **Starter $29/mo** and **Growth $149/mo**; copy the price IDs into
   `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_GROWTH`.
2. Webhook endpoint: `https://<your-app>/api/v1/billing/webhook`, events:
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

Billing is optional: with no `STRIPE_SECRET_KEY`, the app runs fine on the Free plan and hides
upgrade buttons.

## 5. CI/CD (GitHub Actions)

`.github/workflows/ci.yml` already:

- spins up Postgres + Redis service containers,
- applies migrations,
- typechecks and builds on every push/PR,
- deploys `main` → Vercel staging when `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`
  secrets are set (or replace the deploy job with your Railway/Render deploy hook).

Pushes to `main` auto-deploy to staging after CI passes; tag releases for production.

## 6. Post-deploy checklist

- [ ] `GET /api/v1/auth/me` returns 401 when logged out (cookie flow works)
- [ ] Register an org, connect the **DEMO** provider, hit **Sync now**, see charts populate
- [ ] Set a budget below current spend → alert appears in Budgets → Alert history
- [ ] CSV/PDF export downloads (Growth org)
- [ ] `POST /api/v1/cron/trigger-worker` with `Authorization: Bearer $CRON_SECRET` returns 200
- [ ] Stripe test-mode checkout upgrades the org plan
- [ ] Database backups enabled and restore tested once
