import { NextResponse } from "next/server";

/**
 * Standard JSON API envelope: { success, data } or { success: false, error }.
 */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function fail(status: number, message: string, details?: unknown) {
  return NextResponse.json(
    { success: false, error: { code: status, message, details: details ?? undefined } },
    { status },
  );
}

export const errors = {
  unauthorized: () => fail(401, "Authentication required"),
  fail401: () => fail(401, "Invalid email or password"),
  fail403Export: () =>
    fail(403, "Export is available on the Growth plan. Upgrade to unlock CSV/PDF exports."),
  forbidden: () => fail(403, "You do not have permission to perform this action"),
  notFound: (what = "Resource") => fail(404, `${what} not found`),
  badRequest: (msg = "Invalid request", details?: unknown) => fail(400, msg, details),
  conflict: (msg: string) => fail(409, msg),
  tooMany: (msg = "Too many requests") => fail(429, msg),
  internal: (e: unknown) => {
    console.error("[api]", e);
    return fail(500, "Internal server error");
  },
};

/** Wrap a handler with top-level error handling. */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function handler(fn: (req: Request, ctx: any) => Promise<Response>) {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return async (req: Request, ctx: any = {}) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      return errors.internal(e);
    }
  };
}
