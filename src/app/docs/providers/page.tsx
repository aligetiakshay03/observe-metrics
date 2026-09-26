import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Providers", alternates: { canonical: "/docs/providers" } };

export default function ProvidersDocs() {
  return (
    <>
      <h1>Connecting providers</h1>
      <p>
        Provider connections are managed in <strong>Settings → Providers</strong> by Owners and Admins. All provider calls happen server-side; your key is never sent back
        to the browser.
      </p>

      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Credential</th>
            <th>What ObserveMetrics reads</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>OpenAI</td>
            <td className="whitespace-normal">Admin key (sk-admin-…)</td>
            <td className="whitespace-normal">Daily completions usage grouped by model, and daily costs by line item</td>
          </tr>
          <tr>
            <td>Anthropic</td>
            <td className="whitespace-normal">Admin key (sk-ant-admin…)</td>
            <td className="whitespace-normal">Daily messages usage report grouped by model, and the cost report</td>
          </tr>
          <tr>
            <td>Google Gemini</td>
            <td className="whitespace-normal">Gemini API key</td>
            <td className="whitespace-normal">Key verification and model list only</td>
          </tr>
          <tr>
            <td>Mistral</td>
            <td className="whitespace-normal">API key</td>
            <td className="whitespace-normal">Key verification and model list only</td>
          </tr>
        </tbody>
      </table>

      <h2>OpenAI</h2>
      <p>
        Create an <strong>Admin key</strong> in OpenAI → Organization settings → Admin keys. Standard project keys can&apos;t read organization usage; if you paste one,
        the connection test explains that the key lacks permission.
      </p>
      <ul>
        <li>
          Usage: <code>GET /v1/organization/usage/completions</code> with daily buckets grouped by model — input tokens (including cached), cached tokens, output tokens and
          request counts.
        </li>
        <li>
          Costs: <code>GET /v1/organization/costs</code> grouped by line item. Line items are attributed to the matching model; those costs are labelled{" "}
          <em>Provider reported</em>. Where no cost line matches, cost is estimated from tokens and list price.
        </li>
      </ul>

      <h2>Anthropic</h2>
      <p>
        Create an <strong>Admin key</strong> in Claude Console → Settings → Admin keys. Regular API keys can&apos;t read organization usage.
      </p>
      <ul>
        <li>
          Usage: <code>GET /v1/organizations/usage_report/messages</code> with daily buckets grouped by model — uncached input, cache reads, cache writes and output tokens.
          The usage report doesn&apos;t include request counts, so request-based metrics for Anthropic come from instrumented applications.
        </li>
        <li>
          Costs: <code>GET /v1/organizations/cost_report</code>. Amounts are reported in cents and converted to dollars; matched to models, they are labelled{" "}
          <em>Provider reported</em>.
        </li>
      </ul>

      <h2>Google Gemini and Mistral</h2>
      <p>
        Gemini API keys and Mistral API keys can list models but there is no API that returns historical usage for a key. Connecting these providers verifies the key and
        records how many models it can access; send usage from your applications with the <Link href="/docs/sdk">ingestion API</Link> (use <code>&quot;provider&quot;:
        &quot;google&quot;</code> or <code>&quot;mistral&quot;</code>).
      </p>

      <h2>Sync schedule</h2>
      <ul>
        <li>The first sync backfills the last 30 days.</li>
        <li>After that, connections sync every six hours and re-read the last three days, because providers finalize recent usage late. Re-reads replace earlier values — they never double count.</li>
        <li>
          <strong>Sync now</strong> runs a sync immediately; <strong>Sync all</strong> does so for every active connection.
        </li>
        <li>Rate limits, timeouts and provider outages are retried automatically up to three attempts with increasing back-off (2, 4 and 8 minutes).</li>
        <li>If a key is revoked or loses permission, the connection is marked as errored, an alert is raised and syncing resumes once you update the key.</li>
      </ul>
      <p>Each connection shows its status, last sync, next scheduled sync and recent sync history.</p>

      <h2>Test connection</h2>
      <p>
        <strong>Test connection</strong> makes a single read-only request to the provider with the key and reports whether it is valid and has the needed scope. When testing a
        key before saving, the key is used once and discarded. Testing a saved connection decrypts the key on the server only.
      </p>

      <h2>Key security</h2>
      <ul>
        <li>Keys are encrypted with AES-256-GCM before storage and bound to your workspace.</li>
        <li>After saving, only the last four characters are ever shown (for example <code>••••••••••••abcd</code>).</li>
        <li>Keys are never returned by the API, written to logs, included in error messages or placed in URLs.</li>
        <li>Connecting, updating, testing and disconnecting are recorded in the audit log.</li>
        <li>Disconnecting deletes the stored key. Usage already synced is kept.</li>
      </ul>
      <p>
        More in <Link href="/docs/security">Security</Link>.
      </p>
    </>
  );
}
