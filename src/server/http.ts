import "server-only";
import { NextResponse } from "next/server";
import type { z, ZodTypeAny } from "zod";
import { logger } from "./log";
import { assertProductionConfig } from "./env";

const log = logger("api");

/** Error codes shared with the client (src/lib/api-client.ts). */
export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "conflict"
  | "rate_limited"
  | "provider_auth_failed"
  | "provider_permission"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "sync_failed"
  | "database_unavailable"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  conflict: 409,
  rate_limited: 429,
  provider_auth_failed: 422,
  provider_permission: 422,
  provider_rate_limited: 429,
  provider_unavailable: 502,
  sync_failed: 502,
  database_unavailable: 503,
  internal: 500,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const E = {
  unauthorized: () => new ApiError("unauthorized", "Please sign in to continue."),
  forbidden: (msg = "You don't have permission to do that in this workspace.") => new ApiError("forbidden", msg),
  notFound: (what = "Resource") => new ApiError("not_found", `${what} not found.`),
  invalid: (msg = "Some fields are invalid.", fields?: Record<string, string>) => new ApiError("invalid_input", msg, fields),
  conflict: (msg: string, fields?: Record<string, string>) => new ApiError("conflict", msg, fields),
  rateLimited: (msg = "Too many requests. Please wait a moment and try again.") => new ApiError("rate_limited", msg),
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function errorResponse(err: ApiError) {
  return NextResponse.json(
    { ok: false, error: { code: err.code, message: err.message, fields: err.fields } },
    { status: STATUS[err.code] },
  );
}

const MAX_BODY_BYTES = 1_000_000;

/** Parse a JSON body against a zod schema, mapping issues to field errors. */
export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw E.invalid("Request body is too large (max 1 MB).");
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) throw new Error("too large");
    raw = JSON.parse(text);
  } catch (e) {
    throw E.invalid((e as Error).message === "too large" ? "Request body is too large (max 1 MB)." : "Request body must be valid JSON.");
  }
  return parseWith(schema, raw);
}

export function parseWith<S extends ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    throw E.invalid("Please check the highlighted fields.", fields);
  }
  return parsed.data;
}

function isPrismaConnectionError(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? "";
  const code = (e as { code?: string })?.code ?? "";
  return name === "PrismaClientInitializationError" || code === "P1001" || code === "P1002" || code === "P2024";
}

let configChecked = false;
function checkConfigOnce() {
  if (configChecked) return;
  assertProductionConfig();
  configChecked = true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler<C = any> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Wrap a route handler: maps ApiError → JSON error, database outages → 503,
 * anything else → a generic 500 (details are logged, redacted, never returned).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function route<C = any>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      checkConfigOnce();
    } catch (e) {
      log.error("refusing to serve: " + (e as Error).message);
      return errorResponse(new ApiError("internal", "The server is misconfigured. Check the deployment logs."));
    }
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e);
      if (isPrismaConnectionError(e)) {
        log.error("database unavailable", e);
        return errorResponse(new ApiError("database_unavailable", "The database is temporarily unavailable. Please try again shortly."));
      }
      log.error(`${req.method} ${new URL(req.url).pathname} failed`, e);
      return errorResponse(new ApiError("internal", "Something went wrong on our side. Please try again."));
    }
  };
}

/**
 * Client IP for rate limiting and audit logs. Uses the right-most
 * X-Forwarded-For entry — the one appended by the proxy in front of the app —
 * because left-most entries are client-controlled and trivially spoofed.
 * Set TRUSTED_PROXY_HOPS if more than one proxy sits in front of the app.
 */
export function clientIp(req: Request): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1));
  const chain = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return chain[chain.length - hops] ?? chain[0] ?? req.headers.get("x-real-ip") ?? "unknown";
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
