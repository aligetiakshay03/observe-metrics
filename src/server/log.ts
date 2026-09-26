/**
 * Structured logger with secret redaction. Every server log line goes through
 * `redact`, so an accidental provider key in an error message never reaches
 * stdout / log aggregation.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_\-]{8,}/g, // Anthropic
  /sk-(?:proj-|admin-|svcacct-)?[A-Za-z0-9_\-]{16,}/g, // OpenAI
  /AIza[0-9A-Za-z_\-]{20,}/g, // Google API keys
  /om_(?:live|ingest)_[A-Za-z0-9_\-]{16,}/g, // ObserveMetrics ingestion keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /(bearer\s+)[A-Za-z0-9._\-]{16,}/gi,
  /("?(?:api[_-]?key|apiKey|password|secret|token|authorization|x-api-key)"?\s*[:=]\s*"?)[^"\s,}]{6,}/gi,
];

export function redact(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (match, prefix?: string) =>
      typeof prefix === "string" && match.startsWith(prefix) ? prefix + "[REDACTED]" : "[REDACTED]",
    );
  }
  return out;
}

function fmt(value: unknown): string {
  if (value instanceof Error) return redact(`${value.name}: ${value.message}`);
  if (typeof value === "string") return redact(value);
  try {
    return redact(JSON.stringify(value));
  } catch {
    return "[unserializable]";
  }
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, scope: string, message: string, meta?: unknown) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} [${scope}] ${redact(message)}${
    meta === undefined ? "" : " " + fmt(meta)
  }`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logger(scope: string) {
  return {
    debug: (m: string, meta?: unknown) => write("debug", scope, m, meta),
    info: (m: string, meta?: unknown) => write("info", scope, m, meta),
    warn: (m: string, meta?: unknown) => write("warn", scope, m, meta),
    error: (m: string, meta?: unknown) => write("error", scope, m, meta),
  };
}
