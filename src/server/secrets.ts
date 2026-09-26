/**
 * Secret handling for provider credentials.
 *
 *  - AES-256-GCM with a random 96-bit IV per secret.
 *  - The workspace id is bound as Additional Authenticated Data, so a sealed
 *    secret copied into another workspace's row fails to decrypt.
 *  - Format: `v1:<keyId>:<iv>:<tag>:<ciphertext>` (hex). The key id allows
 *    rotation: set ENCRYPTION_KEY to the new key and ENCRYPTION_KEY_PREVIOUS
 *    to the old one; secrets are re-sealed on next write.
 *  - Plaintext only exists in memory for the duration of a validation or sync
 *    call and is never returned to the client or logged.
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";

interface KeyEntry {
  id: string;
  key: Buffer;
}

function keyId(key: Buffer): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 8);
}

function parseKey(hex: string | undefined): Buffer | null {
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, "hex");
  return null;
}

function loadKeys(): KeyEntry[] {
  const primary = parseKey(process.env.ENCRYPTION_KEY);
  const keys: KeyEntry[] = [];
  if (primary) {
    keys.push({ id: keyId(primary), key: primary });
  } else {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY must be a 64-character hex string in production");
    }
    // Development fallback: a stable key derived from JWT_SECRET/dev constant.
    const dev = crypto.createHash("sha256").update("om-dev:" + (process.env.JWT_SECRET ?? "dev-only")).digest();
    keys.push({ id: keyId(dev), key: dev });
  }
  const previous = parseKey(process.env.ENCRYPTION_KEY_PREVIOUS);
  if (previous) keys.push({ id: keyId(previous), key: previous });
  return keys;
}

let cached: KeyEntry[] | null = null;
function keys(): KeyEntry[] {
  if (!cached) cached = loadKeys();
  return cached;
}

/** For tests only — forces keys to be re-read from the environment. */
export function __resetSecretKeysForTests() {
  cached = null;
}

export interface SealedSecret {
  ciphertext: string;
  last4: string;
}

export function sealSecret(plaintext: string, workspaceId: string): SealedSecret {
  if (!plaintext) throw new Error("Cannot seal an empty secret");
  const { id, key } = keys()[0]!;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  cipher.setAAD(Buffer.from("ws:" + workspaceId));
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ["v1", id, iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":"),
    last4: maskTail(plaintext),
  };
}

export function openSecret(ciphertext: string, workspaceId: string): string {
  const parts = ciphertext.split(":");
  if (parts[0] === "v1" && parts.length === 5) {
    const [, id, ivHex, tagHex, dataHex] = parts as [string, string, string, string, string];
    const entry = keys().find((k) => k.id === id);
    if (!entry) throw new SecretError("No decryption key available for this secret (key rotated?)");
    return decrypt(entry.key, ivHex, tagHex, dataHex, Buffer.from("ws:" + workspaceId));
  }
  // Legacy 0_init format (iv:tag:ct, no AAD). Tried against every configured key.
  if (parts.length === 3) {
    const legacyKeys = [...keys().map((k) => k.key), crypto.createHash("sha256").update(process.env.JWT_SECRET ?? "dev-only").digest()];
    for (const k of legacyKeys) {
      try {
        return decrypt(k, parts[0]!, parts[1]!, parts[2]!, null);
      } catch {
        /* try next */
      }
    }
  }
  throw new SecretError("Stored credential could not be decrypted");
}

function decrypt(key: Buffer, ivHex: string, tagHex: string, dataHex: string, aad: Buffer | null): string {
  try {
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretError("Stored credential could not be decrypted");
  }
}

export class SecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretError";
  }
}

/** Last four visible characters for display (`••••••••••••abcd`). */
export function maskTail(secret: string): string {
  const trimmed = secret.trim();
  // Service-account JSON: show the key id tail rather than JSON punctuation.
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { private_key_id?: string };
      if (parsed.private_key_id) return parsed.private_key_id.slice(-4);
    } catch {
      /* fall through */
    }
    return "json";
  }
  return trimmed.slice(-4);
}

export function maskedDisplay(last4: string): string {
  return "••••••••••••" + last4;
}

/** SHA-256 hex digest (tokens, ingestion keys). */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
