/**
 * AES-256-GCM encryption for provider API keys at rest.
 *
 * Format:  iv(12B) : authTag(16B) : ciphertext, hex-encoded, colon-separated.
 * The key comes from ENCRYPTION_KEY (64 hex chars = 32 bytes). When a 64-char
 * hex key is not configured we derive a deterministic dev key — fine for local
 * development, and forced to fail loudly in production (see assertKey).
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, "hex");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes) in production.",
    );
  }
  // Dev fallback: derive a stable key from JWT_SECRET so encrypted data
  // survives restarts without extra configuration.
  return crypto.createHash("sha256").update(process.env.JWT_SECRET ?? "dev-only").digest();
}

function getKey(): Buffer {
  const cache = (globalThis as any).__omEncKey as Buffer | undefined;
  if (cache) return cache;
  const key = loadKey();
  (globalThis as any).__omEncKey = key;
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), enc.toString("hex")].join(":");
}

export function decryptSecret(payload: string): string {
  if (payload === "seeded-demo-connection") return "demo-key-not-real";
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid ciphertext payload");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

/** Never expose full keys — only the last 4 characters. */
export function keyLast4(secret: string): string {
  return secret.slice(-4);
}
