# ObserveMetrics API

Base URL: `/api/v1`

## Conventions

- **Auth**: session JWT in the httpOnly cookie `om_session` (set by login/register/invite-accept).
  Org-scoped endpoints resolve the active organization from the `om_active_org` cookie, the
  `X-Org-Id` header, or an `orgId` query param (must be an org you belong to).
- **Envelope**: success → `{ "success": true, "data": … }`; error → `{ "success": false, "error": { "code", "message", "details"? } }`.
- **Errors**: `400` validation · `401` unauthenticated · `403` forbidden/plan-gated · `404` not found ·
  `409` conflict · `429` rate-limited · `500` internal.
- **Rate limits**: login/register 10/min/IP, invites 20/min/user, connections 20/min/user.
- **Validation**: all bodies validated with Zod; invalid payloads return 400 with field details.

## Auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | `{ name, email, password, organizationName }` → creates user + org + admin membership, sets session. |
| POST | `/auth/login` | `{ email, password }` → sets session cookie. |
| POST | `/auth/logout` | Clears session. |
| GET | `/auth/me` | Current user, organizations (with plan limits), active org. |
| GET | `/auth/google` | Redirects to Google OAuth consent (requires `GOOGLE_CLIENT_ID`). |
| GET | `/auth/google/callback` | OAuth callback; creates/links user, sets session, redirects to `/dashboard`. |

## Providers

| Method | Path | Description |
|---|---|---|
| GET | `/providers` | List connections (never returns keys — only `keyLast4`). |
| POST | `/providers` | Connect: `{ provider: OPENAI\|ANTHROPIC\|GOOGLE\|MISTRAL\|DEMO, apiKey, name? }`. Key is verified with the provider, then stored AES-256-GCM encrypted. Plan provider limit enforced. |
| PATCH | `/providers/:id` | Re-enter key `{ apiKey? }`, rename `{ name? }`, or `{ status: ACTIVE\|DISABLED }`. |
| DELETE | `/providers/:id` | Remove connection (admin). |
| POST | `/providers/sync` | Sync all connections for the active org now. |
| POST | `/providers/:id/sync` | Sync one connection now. |
| GET | `/sync-jobs` | Recent sync job history. |

## Members & invites

| Method | Path | Description |
|---|---|---|
| GET | `/members` | Members + pending invites. |
| POST | `/members` | Invite (admin): `{ email, role: ADMIN\|MEMBER, team? }` → sends invite email, returns `inviteUrl`. Plan member limit enforced. |
| PATCH | `/members/:id` | Change role/team (admin). Guards the last admin. |
| DELETE | `/members/:id` | Remove member (admin). Guards the last admin. |
| GET | `/invite/:token` | Public invite details. |
| POST | `/invite/:token` | Accept invite; creates account when `{ password }` provided. |

## Analytics (all accept `from`/`to` as `YYYY-MM-DD` + optional `provider`)

| Method | Path | Description |
|---|---|---|
| GET | `/analytics/overview` | Totals (spend, tokens, requests, Δ%), daily trend, by-provider, by-model. |
| GET | `/analytics/tokens` | Token totals, by-model, by-provider, daily stacked series. |
| GET | `/analytics/costs` | Cost by model, by team, monthly series + 3-month forecast, avg cost/request. |

Retention: results are clipped to the org plan's retention window automatically.

## Budgets & alerts

| Method | Path | Description |
|---|---|---|
| GET | `/budgets` | Budgets with live progress (spent, %, days left). `budgetsEnabled` reflects plan. |
| POST | `/budgets` | Create (admin, Growth): `{ team?: string\|null, amountCents }`. |
| PATCH | `/budgets/:id` | Update amount (admin) — resets alert stamps. |
| DELETE | `/budgets/:id` | Remove budget (admin). |
| GET | `/alerts` | Recent alert events (budget 80/100, sync failures). |
| POST | `/alerts` | Mark alerts read `{ ids?: string[] }`. |

## Exports (Growth plan)

| Method | Path | Description |
|---|---|---|
| GET | `/exports/csv?view=overview\|tokens\|costs\|costs_by_team` | CSV download of the chosen view. |
| GET | `/exports/pdf?month=YYYY-MM` | Monthly summary PDF (headline KPIs, top models/teams, MoM). |

## Organization

| Method | Path | Description |
|---|---|---|
| GET | `/org` | Active org record. |
| PATCH | `/org` | Rename / set `monthlyBudgetCents` (admin). |

## Billing (ObserveMetrics' own Stripe subscription)

| Method | Path | Description |
|---|---|---|
| POST | `/billing/checkout` | `{ plan: STARTER\|GROWTH }` → Stripe Checkout URL (admin). |
| POST | `/billing/portal` | Stripe customer portal URL (admin). |
| POST | `/billing/webhook` | Stripe webhook (signature-verified): keeps org plan + subscription in sync. |

## System

| Method | Path | Description |
|---|---|---|
| POST | `/cron/trigger-worker` | Runs one full tick (sync all orgs, budgets, retention). Protected by `CRON_SECRET` when set. Used by Vercel cron / uptime pingers. |
| POST | `/demo/seed` | DEMO_MODE only: attach the DEMO provider and backfill 60 days of history. |
