import type { Metadata } from "next";

export const metadata: Metadata = { title: "Security", alternates: { canonical: "/docs/security" } };

export default function SecurityDocs() {
  return (
    <>
      <h1>Security</h1>
      <p>
        This page describes the protections implemented in ObserveMetrics today. It is a technical description, not a compliance certification — ObserveMetrics does not
        currently hold third-party certifications such as SOC 2.
      </p>

      <h2>Provider credentials</h2>
      <ul>
        <li>
          Encrypted at rest with <strong>AES-256-GCM</strong> using a random 96-bit IV per secret. The workspace id is bound as additional authenticated data, so a
          ciphertext copied to another workspace can&apos;t be decrypted.
        </li>
        <li>The encryption key comes from server environment configuration and supports rotation (a previous key can be kept for decryption during rotation).</li>
        <li>
          Keys are decrypted only in server memory for a connection test or sync. They are never returned to the browser after saving, never written to logs, never
          included in error messages and never placed in URLs.
        </li>
        <li>The UI shows only a masked form with the last four characters.</li>
        <li>Server logs pass through a redaction filter that masks common key formats as a second line of defence.</li>
        <li>Provider error responses are mapped to safe messages; response bodies (which can echo part of a key) are discarded.</li>
      </ul>

      <h2>Accounts and sessions</h2>
      <ul>
        <li>Passwords are hashed with bcrypt (cost 12) and require at least 10 characters with a letter and a number. Plain-text passwords are never stored.</li>
        <li>
          Sessions are random 256-bit tokens in an <code>httpOnly</code>, <code>SameSite=Lax</code> cookie (<code>Secure</code> in production). Only a SHA-256 hash of the
          token is stored, so a database leak doesn&apos;t yield usable sessions.
        </li>
        <li>“Remember me” keeps a session for 30 days; otherwise the session ends with the browser and expires server-side after 24 hours.</li>
        <li>Signing out revokes the session on the server. Changing or resetting your password signs out your other sessions.</li>
        <li>Password reset links are single-use, expire after one hour and are stored hashed. The reset request responds identically whether or not an account exists.</li>
        <li>Sign-in, sign-up, reset and other sensitive endpoints are rate limited per IP and per account.</li>
        <li>Google sign-in (when enabled) only accepts verified Google email addresses and uses a server-side state parameter against CSRF.</li>
      </ul>

      <h2>Request protection</h2>
      <ul>
        <li>State-changing API requests must come from the same origin (Origin / Sec-Fetch-Site checks) in addition to SameSite cookies.</li>
        <li>All input is validated server-side with strict schemas.</li>
        <li>Database access uses parameterized queries through Prisma; there is no string-built SQL.</li>
        <li>Responses set a Content-Security-Policy, <code>X-Frame-Options: DENY</code>, <code>nosniff</code>, a strict referrer policy and HSTS in production.</li>
        <li>CSV exports escape cells beginning with <code>=</code>, <code>+</code>, <code>-</code> or <code>@</code> to prevent spreadsheet formula injection.</li>
      </ul>

      <h2>Workspaces and permissions</h2>
      <p>Every workspace-owned record carries its workspace id, and every query is scoped by the workspace resolved from your session — never from ids supplied in a request. Requesting another workspace&apos;s resource returns “not found”.</p>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Can</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Viewer</td>
            <td className="whitespace-normal">View dashboards, insights, alerts and budgets, and export CSV.</td>
          </tr>
          <tr>
            <td>Member</td>
            <td className="whitespace-normal">Everything a Viewer can, plus mark alerts read/resolved and update insight status.</td>
          </tr>
          <tr>
            <td>Admin</td>
            <td className="whitespace-normal">Manage providers, ingestion keys, budgets, teams, applications, workspace settings and invite members.</td>
          </tr>
          <tr>
            <td>Owner</td>
            <td className="whitespace-normal">Everything, including granting or revoking Admin/Owner and deleting the workspace. A workspace always keeps at least one Owner.</td>
          </tr>
        </tbody>
      </table>
      <p>Permissions are enforced on the server for every request; hiding a button in the UI is never the only check.</p>

      <h2>Ingestion keys</h2>
      <ul>
        <li>Generated server-side, shown exactly once, and stored only as a SHA-256 hash with a short display prefix.</li>
        <li>Scoped to one workspace, revocable at any time, and rate limited per key.</li>
      </ul>

      <h2>Audit log</h2>
      <p>
        Sensitive actions are recorded with the actor, time and IP address: provider connected, updated, tested or disconnected; sync requested; members invited, joined,
        removed or role changed; budgets, teams and applications created, updated or deleted; ingestion keys created or revoked; notification settings changed; data
        exported or deleted; password changes and session revocations. Audit entries never contain secrets. Admins can review them in Settings → Security.
      </p>

      <h2>Your data</h2>
      <ul>
        <li>ObserveMetrics stores usage metadata — counts, costs, latency, status and attribution — not prompts or completions.</li>
        <li>Admins can delete all usage data for a workspace from Settings → Data; Owners can delete the workspace entirely.</li>
        <li>Demo workspaces contain generated data only and can&apos;t hold real provider credentials or ingestion keys.</li>
      </ul>
    </>
  );
}
