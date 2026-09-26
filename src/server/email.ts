import "server-only";
import { env } from "./env";
import { logger } from "./log";

const log = logger("email");

interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type Transport = { sendMail: (m: Mail & { from: string }) => Promise<unknown> };
const g = globalThis as unknown as { __omMailer?: Transport | null };

async function transport(): Promise<Transport | null> {
  if (!env.smtpEnabled) return null;
  if (g.__omMailer) return g.__omMailer;
  const nodemailer = await import("nodemailer");
  g.__omMailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  }) as unknown as Transport;
  return g.__omMailer;
}

/**
 * Sends mail via SMTP. Without SMTP configured:
 *  - development: the message (including links) is printed to the server
 *    console so flows like password reset can be exercised locally;
 *  - production: nothing is printed except the recipient domain, because
 *    reset links are credentials.
 * Returns whether the message was actually handed to an SMTP server.
 */
export async function sendEmail(mail: Mail): Promise<boolean> {
  const t = await transport();
  if (!t) {
    if (env.isProd) {
      log.warn(`SMTP not configured; email to *@${mail.to.split("@")[1]} not sent ("${mail.subject}")`);
    } else {
      console.log(`\n[email:dev] To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    }
    return false;
  }
  try {
    await t.sendMail({ from: process.env.SMTP_FROM ?? "ObserveMetrics <no-reply@observemetrics.dev>", ...mail });
    return true;
  } catch (e) {
    log.error("SMTP send failed", e);
    return false;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, body: string, cta?: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#F8F9FB;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111318">
  <div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #E6E8EC;border-radius:10px;padding:28px">
    <div style="font-weight:600;font-size:14px;margin-bottom:20px">ObserveMetrics</div>
    <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h1>
    <div style="font-size:14px;line-height:1.6;color:#344054">${body}</div>
    ${cta ? `<p style="margin:24px 0 0"><a href="${escapeHtml(cta.href)}" style="background:#4F46E5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">${escapeHtml(cta.label)}</a></p>` : ""}
  </div></body></html>`;
}

export function passwordResetEmail(to: string, link: string): Mail {
  return {
    to,
    subject: "Reset your ObserveMetrics password",
    text: `Someone requested a password reset for your ObserveMetrics account.\n\nReset it here (valid for 1 hour):\n${link}\n\nIf this wasn't you, you can ignore this email.`,
    html: layout(
      "Reset your password",
      "<p>Someone requested a password reset for your ObserveMetrics account. This link is valid for 1 hour.</p><p>If this wasn't you, you can ignore this email.</p>",
      { label: "Reset password", href: link },
    ),
  };
}

export function inviteEmail(to: string, workspaceName: string, inviter: string, link: string, role: string): Mail {
  return {
    to,
    subject: `${inviter} invited you to ${workspaceName} on ObserveMetrics`,
    text: `${inviter} invited you to join ${workspaceName} on ObserveMetrics as ${role.toLowerCase()}.\n\nAccept (valid 7 days): ${link}`,
    html: layout(
      `Join ${workspaceName}`,
      `<p><strong>${escapeHtml(inviter)}</strong> invited you to join <strong>${escapeHtml(workspaceName)}</strong> as ${escapeHtml(role.toLowerCase())}. The link is valid for 7 days.</p>`,
      { label: "Accept invitation", href: link },
    ),
  };
}

export function alertEmail(to: string, workspaceName: string, title: string, message: string, link: string): Mail {
  return {
    to,
    subject: `[ObserveMetrics] ${title}`,
    text: `${workspaceName}: ${title}\n\n${message}\n\nView: ${link}`,
    html: layout(title, `<p>${escapeHtml(message)}</p><p style="color:#667085">Workspace: ${escapeHtml(workspaceName)}</p>`, {
      label: "View in ObserveMetrics",
      href: link,
    }),
  };
}
