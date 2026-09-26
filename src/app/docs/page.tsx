import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Overview", alternates: { canonical: "/docs" } };

export default function DocsOverview() {
  return (
    <>
      <p className="mb-2 text-2xs font-semibold uppercase tracking-[0.12em] text-accent">Documentation</p>
      <h1>What is ObserveMetrics?</h1>
      <p>
        ObserveMetrics is a central place to track, understand and optimize how your company uses AI providers. It combines usage analytics (requests and tokens),
        cost intelligence (spend, projections and budgets), performance analytics (latency and error rates) and optimization insights, broken down by provider,
        model, team, application and user.
      </p>
      <p>
        New here? Start with the <Link href="/docs/quickstart">Quickstart</Link>, or open the <Link href="/demo">live demo</Link> to explore a workspace full of sample data.
      </p>

      <h2>How data is collected</h2>
      <p>There are two ways usage reaches a workspace. Both end up in the same normalized schema, so dashboards, insights and exports work the same regardless of source.</p>
      <ol>
        <li>
          <strong>Provider sync.</strong> Connect an OpenAI or Anthropic <em>Admin</em> key and ObserveMetrics reads your organization&apos;s daily usage and cost reports
          server-side, grouped by model. See <Link href="/docs/providers">Providers</Link>.
        </li>
        <li>
          <strong>Ingestion API.</strong> Your applications send one event per model call to <code>POST /api/v1/events</code> with token counts, latency, status and attribution
          (application, team, user). This works for every provider — including Google Gemini and Mistral, whose API keys can&apos;t read historical usage. See{" "}
          <Link href="/docs/sdk">Ingestion API</Link>.
        </li>
      </ol>
      <p>
        ObserveMetrics does <strong>not</strong> read personal ChatGPT or Claude subscription usage — consumer chat plans don&apos;t expose usage to third parties.
      </p>

      <h2>The normalized usage record</h2>
      <p>Every event or provider bucket becomes a usage record with these fields:</p>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["provider, model", "Normalized ids, e.g. anthropic / claude-sonnet-4-6 (date suffixes are stripped)."],
            ["application, team, user", "Attribution. Applications and teams are created automatically the first time they appear."],
            ["requests, errors", "Request count (1 for an ingested event; provider buckets may aggregate many)."],
            ["input / output / cached tokens", "Token counts as reported."],
            ["cost + cost source", "Provider reported, calculated estimate, or demo."],
            ["latency", "Measured by your application. Provider usage APIs don't report latency."],
            ["status, error code, request id, prompt hash", "Reliability, idempotency and duplicate detection."],
          ].map(([f, m]) => (
            <tr key={f}>
              <td>
                <code>{f}</code>
              </td>
              <td className="whitespace-normal">{m}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Records are aggregated into daily rollups that dashboards read. Rollups are recomputed from the underlying records, so re-syncing a period never double counts.</p>

      <h2>Data accuracy labels</h2>
      <p>Every cost figure says where it came from:</p>
      <ul>
        <li>
          <strong>Provider reported</strong> — taken from the provider&apos;s cost API (OpenAI Costs API, Anthropic cost report) or sent as <code>cost_usd</code> by your application.
        </li>
        <li>
          <strong>Estimated</strong> — calculated from recorded tokens and the model&apos;s list price in the ObserveMetrics pricing catalog. Estimates do not include negotiated
          discounts, taxes or credits and are never presented as an invoice. Models missing from the catalog are shown with a zero estimate and flagged as unpriced.
        </li>
        <li>
          <strong>Demo</strong> — generated sample data in a demo workspace (Helix Labs, a fictional company). Demo data never mixes with a real workspace.
        </li>
      </ul>
      <p>Projected monthly spend is also an estimate: month-to-date spend plus the trailing seven-day daily average for the remaining days of the month.</p>

      <h2>Insights</h2>
      <p>
        Insights come from deterministic rules over your daily usage — no machine-learning model is involved, and every number in an insight can be traced back to your data.
        The current rules compare the last seven complete days with the previous two weeks and detect: cost anomalies, usage spikes, latency regressions, error spikes,
        provider incidents, oversized context, high-cost models used for short-output work, duplicate prompts and budget thresholds. Each insight lists what happened, why it
        matters, the likely cause, a recommended action, evidence metrics and — where it can be estimated — the monthly impact.
      </p>
      <p>ObserveMetrics measures cost, usage, latency and reliability. It does not measure output quality, so validate any model switch on your own evaluation set.</p>

      <h2>FAQ</h2>
      <h3>Is ObserveMetrics free?</h3>
      <p>Yes — every feature is free during launch.</p>
      <h3>Do you store prompts or completions?</h3>
      <p>No. The ingestion API accepts metadata and counts only. For duplicate detection, send a hash of the prompt computed in your application.</p>
      <h3>How often does provider data update?</h3>
      <p>Connected providers sync every six hours, and you can run “Sync now” at any time from Settings → Providers.</p>
      <h3>Can several people use one workspace?</h3>
      <p>Yes. Invite teammates as Owner, Admin, Member or Viewer; permissions are enforced on the server. See <Link href="/docs/security">Security</Link>.</p>
    </>
  );
}
