/**
 * Email sending. Uses SMTP when configured; otherwise logs to console so
 * development and staging still work without credentials.
 */
interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

const globalForMailer = globalThis as unknown as { __omTransport?: unknown };

async function getTransport(): Promise<{ sendMail: (opts: MailInput) => Promise<unknown> } | null> {
  if (!process.env.SMTP_HOST) return null;
  if (globalForMailer.__omTransport) return globalForMailer.__omTransport as never;
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    globalForMailer.__omTransport = transport;
    return transport as never;
  } catch (e) {
    console.warn("[mailer] nodemailer unavailable, emails will be logged:", (e as Error).message);
    return null;
  }
}

export async function sendEmail(mail: MailInput): Promise<void> {
  const transport = await getTransport();
  const from = process.env.SMTP_FROM ?? "ObserveMetrics <no-reply@observemetrics.dev>";
  if (!transport) {
    console.log(`[email:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text ?? mail.html}`);
    return;
  }
  try {
    await transport.sendMail({ from, ...mail });
  } catch (e) {
    console.error("[mailer] send failed:", e);
  }
}

export function inviteEmailHtml(orgName: string, inviteUrl: string, role: string): string {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto">
    <h2>You've been invited to ${orgName} on ObserveMetrics</h2>
    <p>Join your team to see AI spend and usage analytics for <strong>${orgName}</strong>.</p>
    <p><a href="${inviteUrl}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Accept invitation</a></p>
    <p style="color:#6b7280;font-size:13px">Role: ${role} · Link expires in 7 days.</p>
  </div>`;
}

export function budgetAlertEmailHtml(params: {
  orgName: string;
  team?: string;
  percent: number;
  spentUsd: string;
  budgetUsd: string;
}): string {
  const scope = params.team ? `the <strong>${params.team}</strong> team` : "your organization";
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto">
    <h2>${params.percent >= 100 ? "🚨 Budget exceeded" : "⚠️ Budget alert"}</h2>
    <p>AI spend for ${scope} in <strong>${params.orgName}</strong> has reached
    <strong>${params.percent}%</strong> of the monthly budget.</p>
    <p>Spent: <strong>$${params.spentUsd}</strong> of $${params.budgetUsd}</p>
    <p><a href="${process.env.APP_URL ?? ""}/dashboard/budgets" style="background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Review budgets</a></p>
  </div>`;
}
