/** Helpers to call Next.js route handlers directly with real Request objects. */
import { prisma } from "../src/server/db";

const BASE = "http://localhost:3100";
let ipSeq = 0;

export class Client {
  cookies = new Map<string, string>();
  ip = `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  request(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = {
      "x-forwarded-for": this.ip,
      origin: BASE,
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(this.cookies.size ? { cookie: this.cookieHeader() } : {}),
      ...init.headers,
    };
    return new Request(BASE + path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  }

  absorb(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = c.split(";");
      const [k, ...v] = pair!.split("=");
      const value = v.join("=");
      if (attrs.some((a) => /max-age=0/i.test(a.trim())) || value === "") this.cookies.delete(k!.trim());
      else this.cookies.set(k!.trim(), value);
    }
    return res;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: Request, ctx: any) => Promise<Response>;

export async function call(client: Client, handler: Handler, path: string, init: Parameters<Client["request"]>[1] = {}, params: Record<string, string> = {}) {
  const res = client.absorb(await handler(client.request(path, init), { params }));
  const text = await res.text();
  let json: { ok: boolean; data?: any; error?: { code: string; message: string; fields?: Record<string, string> } } | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    json = JSON.parse(text);
  } catch {
    /* csv or empty */
  }
  return { status: res.status, json, text, headers: res.headers };
}

export function uniqueEmail(tag: string) {
  return `${tag}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
}

export async function resetDb() {
  // Order matters for FKs; workspace cascade removes most rows.
  await prisma.$executeRawUnsafe(
    `TRUNCATE "audit_logs","notifications","alerts","insights","budgets","daily_usage","usage_events","api_keys","sync_jobs","provider_connections","applications","teams","invites","memberships","organizations","sessions","password_reset_tokens","oauth_states","users" CASCADE`,
  );
}
