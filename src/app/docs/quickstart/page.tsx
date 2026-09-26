import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "../CodeBlock";

export const metadata: Metadata = { title: "Quickstart", alternates: { canonical: "/docs/quickstart" } };

export default function Quickstart() {
  return (
    <>
      <h1>Quickstart</h1>
      <p>Go from zero to a populated dashboard in about five minutes.</p>

      <h2>1. Create your account and workspace</h2>
      <p>
        <Link href="/signup">Sign up</Link> with your name, work email and a password. Onboarding then asks for a workspace name, your company and your role. The person
        who creates a workspace is its Owner.
      </p>

      <h2>2. Connect a provider (optional)</h2>
      <p>
        In onboarding or <strong>Settings → Providers</strong>, choose a provider and paste a key. <strong>Test connection</strong> checks the key without storing it;{" "}
        <strong>Connect</strong> validates it again, encrypts it and starts the first sync.
      </p>
      <ul>
        <li>
          <strong>OpenAI</strong> and <strong>Anthropic</strong>: use an <em>Admin</em> key. The first sync backfills the last 30 days of usage and costs by model.
        </li>
        <li>
          <strong>Google Gemini</strong> and <strong>Mistral</strong>: the key is verified and models are listed; send usage with the ingestion API.
        </li>
      </ul>
      <p>
        Details are in <Link href="/docs/providers">Providers</Link>.
      </p>

      <h2>3. Create an ingestion key</h2>
      <p>
        To attribute usage to applications, teams and users — and to capture latency and errors — instrument your application. Go to <strong>Settings → Data</strong> and
        create an ingestion key. The key (it starts with <code>om_ingest_</code>) is shown once; store it as a secret in your application&apos;s environment.
      </p>

      <h2>4. Send your first event</h2>
      <CodeBlock
        lang="bash"
        code={`curl -X POST https://YOUR-OBSERVEMETRICS-HOST/api/v1/events \\
  -H "Authorization: Bearer $OBSERVEMETRICS_INGEST_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "openai",
    "model": "gpt-4.1",
    "application": "support-agent",
    "team": "support",
    "input_tokens": 1200,
    "output_tokens": 340,
    "latency_ms": 1480,
    "status": "success"
  }'`}
      />
      <p>
        A <code>202</code> response with <code>{`{"accepted": 1, "duplicates": 0}`}</code> means the event was stored. The application and team are created automatically.
      </p>

      <h2>5. Explore the dashboard</h2>
      <p>
        Open the <strong>Overview</strong>: spend, requests, tokens and latency with period-over-period change, spend by provider, model performance, and insights. From
        there, drill into Usage, Costs, Models, Teams and Applications, set up <strong>Budgets</strong>, and review <strong>Alerts</strong>.
      </p>
      <p>
        Want to see a fully populated workspace first? <Link href="/demo">Open the demo</Link>.
      </p>
    </>
  );
}
