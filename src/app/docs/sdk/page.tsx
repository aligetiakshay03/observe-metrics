import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "../CodeBlock";

export const metadata: Metadata = { title: "Ingestion API & SDK", alternates: { canonical: "/docs/sdk" } };

const FIELDS: [string, string, string, string][] = [
  ["provider", "string", "Yes", "Provider id: openai, anthropic, google, mistral, or any other provider name (max 40 chars)."],
  ["model", "string", "Yes", "Model id as returned by the provider, e.g. gpt-4.1 or claude-sonnet-4-6. Date suffixes are normalized."],
  ["application", "string", "No", "Application slug or name, e.g. support-agent. Created automatically on first use."],
  ["team", "string", "No", "Team slug or name, e.g. support. Created automatically on first use."],
  ["user", "string", "No", "End user or employee identifier (max 120 chars). Avoid sensitive personal data."],
  ["input_tokens", "integer", "Yes", "Prompt tokens, including cached tokens."],
  ["output_tokens", "integer", "Yes", "Completion tokens."],
  ["cached_tokens", "integer", "No", "Portion of input_tokens served from the provider's prompt cache (billed at the cached rate if the catalog has one)."],
  ["latency_ms", "number", "No", "End-to-end latency measured by your application."],
  ["status", '"success" | "error"', "No", 'Defaults to "success".'],
  ["error_code", "string", "No", "Provider or HTTP error code, e.g. rate_limit_exceeded or 529."],
  ["timestamp", "ISO 8601", "No", "When the request happened, with timezone offset. Must be within the last 35 days. Defaults to now."],
  ["request_id", "string", "No", "Your unique id for the call. Events with a request_id already seen are ignored — safe retries."],
  ["prompt_hash", "string", "No", "Hash of the prompt (8–128 chars of A–Z, a–z, 0–9, _ - :). Enables duplicate-prompt detection. Hash in your app; never send prompts."],
  ["cost_usd", "number", "No", "Cost you already know (e.g. from the provider response). Stored as provider reported; otherwise cost is estimated from list prices."],
];

export default function SdkDocs() {
  return (
    <>
      <h1>Ingestion API</h1>
      <p>
        Send usage from any application that calls an AI model. One event per model call gives ObserveMetrics everything provider usage APIs can&apos;t: attribution to
        applications, teams and users, measured latency, errors and duplicate detection. A dedicated SDK is planned; the HTTP API below is stable and small enough to wrap in
        a few lines.
      </p>

      <h2>Endpoint</h2>
      <CodeBlock lang="http" code={`POST /api/v1/events\nAuthorization: Bearer om_ingest_xxxxxxxxxxxxxxxxxxxxxxxx\nContent-Type: application/json`} />
      <ul>
        <li>
          Authenticate with a <strong>workspace ingestion key</strong> from Settings → Data. Keys are shown once, stored only as a SHA-256 hash, and can be revoked at any
          time.
        </li>
        <li>
          The body is a single event, or <code>{`{"events": [ … ]}`}</code> with up to 500 events.
        </li>
        <li>Unknown fields are rejected, so typos surface immediately.</li>
        <li>Rate limit: 600 requests per minute per key. Batch events for high-volume services.</li>
      </ul>

      <h2>Fields</h2>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {FIELDS.map(([f, t, r, d]) => (
            <tr key={f}>
              <td>
                <code>{f}</code>
              </td>
              <td className="text-muted">{t}</td>
              <td>{r}</td>
              <td className="min-w-[280px] whitespace-normal">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Example payload</h2>
      <CodeBlock
        lang="json"
        code={`{
  "provider": "openai",
  "model": "example-model",
  "application": "support-agent",
  "team": "support",
  "input_tokens": 1200,
  "output_tokens": 340,
  "latency_ms": 1480,
  "status": "success"
}`}
      />

      <h2>Responses</h2>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>202</code>
            </td>
            <td className="whitespace-normal">
              Accepted. Body: <code>{`{"ok": true, "data": {"accepted": 1, "duplicates": 0}}`}</code>. <code>duplicates</code> counts events skipped because their{" "}
              <code>request_id</code> was already recorded.
            </td>
          </tr>
          <tr>
            <td>
              <code>400</code>
            </td>
            <td className="whitespace-normal">
              Invalid input. <code>error.fields</code> maps each invalid field (e.g. <code>events.3.input_tokens</code>) to a message. Nothing from the batch is stored.
            </td>
          </tr>
          <tr>
            <td>
              <code>401</code>
            </td>
            <td className="whitespace-normal">Missing, malformed or revoked ingestion key.</td>
          </tr>
          <tr>
            <td>
              <code>429</code>
            </td>
            <td className="whitespace-normal">Rate limit exceeded. Retry with back-off; include request_id so retries stay idempotent.</td>
          </tr>
        </tbody>
      </table>

      <h2>curl</h2>
      <CodeBlock
        lang="bash"
        code={`curl -X POST https://YOUR-OBSERVEMETRICS-HOST/api/v1/events \\
  -H "Authorization: Bearer $OBSERVEMETRICS_INGEST_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"events": [
    {"provider": "anthropic", "model": "claude-sonnet-4-6", "application": "support-agent",
     "team": "support", "user": "agent-42", "input_tokens": 5200, "output_tokens": 410,
     "latency_ms": 2310, "status": "success", "request_id": "req_01J9Z4"}
  ]}'`}
      />

      <h2>TypeScript</h2>
      <p>Wrap your provider call, measure latency and report usage without blocking the response path:</p>
      <CodeBlock
        lang="typescript"
        code={`import { createHash, randomUUID } from "node:crypto";

const OM_URL = process.env.OBSERVEMETRICS_URL!;          // e.g. https://observemetrics.example.com
const OM_KEY = process.env.OBSERVEMETRICS_INGEST_KEY!;   // om_ingest_… (server-side only)

type Usage = { input_tokens: number; output_tokens: number; cached_tokens?: number };

export async function tracked<T extends { usage: Usage }>(
  meta: { provider: string; model: string; application: string; team?: string; user?: string; prompt?: string },
  call: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  const request_id = randomUUID();
  try {
    const result = await call();
    void report({ ...meta, ...result.usage, status: "success", request_id, latency_ms: performance.now() - started });
    return result;
  } catch (err) {
    void report({ ...meta, input_tokens: 0, output_tokens: 0, status: "error", request_id,
      error_code: String((err as { status?: number }).status ?? "error"), latency_ms: performance.now() - started });
    throw err;
  }
}

async function report(e: Record<string, unknown> & { prompt?: string }) {
  const { prompt, ...event } = e;
  // Only a hash of the prompt leaves your service — never the prompt itself.
  if (prompt) event.prompt_hash = createHash("sha256").update(prompt).digest("hex").slice(0, 64);
  try {
    await fetch(\`\${OM_URL}/api/v1/events\`, {
      method: "POST",
      headers: { Authorization: \`Bearer \${OM_KEY}\`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    // Telemetry must never break the product path.
  }
}

// Usage with the Anthropic SDK (response.usage has input_tokens / output_tokens):
// const msg = await tracked(
//   { provider: "anthropic", model: "claude-sonnet-4-6", application: "support-agent", team: "support" },
//   async () => {
//     const r = await anthropic.messages.create({ model: "claude-sonnet-4-6", max_tokens: 1024, messages });
//     return { ...r, usage: { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens } };
//   },
// );`}
      />

      <h2>Python</h2>
      <CodeBlock
        lang="python"
        code={`import hashlib, os, time, uuid
import requests

OM_URL = os.environ["OBSERVEMETRICS_URL"]
OM_KEY = os.environ["OBSERVEMETRICS_INGEST_KEY"]  # om_ingest_…

def report(**event):
    prompt = event.pop("prompt", None)
    if prompt:
        event["prompt_hash"] = hashlib.sha256(prompt.encode()).hexdigest()[:64]
    try:
        requests.post(f"{OM_URL}/api/v1/events", json=event, timeout=3,
                      headers={"Authorization": f"Bearer {OM_KEY}"})
    except requests.RequestException:
        pass  # never fail the caller because of telemetry

start = time.perf_counter()
# response = client.chat.completions.create(model="gpt-4.1", messages=messages)
report(provider="openai", model="gpt-4.1", application="sales-assistant", team="sales",
       input_tokens=1850, output_tokens=420,            # response.usage.prompt_tokens / completion_tokens
       latency_ms=(time.perf_counter() - start) * 1000,
       status="success", request_id=str(uuid.uuid4()))`}
      />

      <h2>Good practice</h2>
      <ul>
        <li>Call the ingestion API from your server, never from a browser — the ingestion key is a secret.</li>
        <li>Always set <code>request_id</code> so retries don&apos;t create duplicates.</li>
        <li>Use stable, low-cardinality slugs for <code>application</code> and <code>team</code>.</li>
        <li>
          Send the model id your provider returns; unknown models are stored and shown as unpriced until the pricing catalog knows them (or you send <code>cost_usd</code>).
        </li>
      </ul>
      <p>
        Next: <Link href="/docs/security">how your data and keys are protected</Link>.
      </p>
    </>
  );
}
