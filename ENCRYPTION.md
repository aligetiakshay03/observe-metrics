# Provider API key encryption

ObserveMetrics stores third-party provider API keys (OpenAI, Anthropic, Google, Mistral) so the
background worker can pull usage data on your behalf. This document describes exactly how those
secrets are protected.

## Approach: AES-256-GCM, envelope format `iv:tag:ciphertext`

- **Algorithm**: AES-256-GCM (authenticated encryption). GCM provides confidentiality *and*
  integrity — any tampering with the ciphertext fails decryption instead of returning garbage.
- **IV**: 12 random bytes generated fresh per encryption (`crypto.randomBytes`), hex-encoded.
  Reuse is impossible in practice since a new IV is drawn for every write.
- **Auth tag**: the 16-byte GCM tag is stored alongside the ciphertext and verified on decrypt.
- **Format**: `iv(hex) : authTag(hex) : ciphertext(hex)` — e.g.
  `9f2c…:b41d…:8a0e…` stored in `provider_connections.api_key_ciphertext`.
- **Key**: 32 bytes from `ENCRYPTION_KEY` (64 hex chars). Loaded once per process.

Implementation: [`src/lib/crypto.ts`](src/lib/crypto.ts) (~60 lines, no third-party crypto deps).

## Key management

- The key never leaves the server. It is **not** stored in the database — only in the process
  environment (or a secrets manager forwarded to the environment in production).
- Production **refuses to boot** without a proper 64-hex-char `ENCRYPTION_KEY` (fails loudly rather
  than silently using a weak fallback).
- Development fallback: when unset, a key is derived from `JWT_SECRET` (SHA-256) so local encrypted
  data survives restarts without extra setup. This path is disabled in production.
- **Rotation**: re-encrypt by reading each connection's plaintext (in memory only) and writing it
  back under the new key: `decryptSecret(old) → encryptSecret(new)`. A rotation script can be run
  per org without downtime because decrypt/encrypt happen per-row on demand.

## What is never exposed

- Full keys are never returned by any API response — `GET /api/v1/providers` and all UI surfaces
  show only `keyLast4`.
- Keys are decrypted **only** inside the sync worker, in memory, for the duration of a provider
  API call.
- Logs and error messages never include key material; sync errors store the provider's HTTP status
  and message, not the request.

## Threat model summary

| Threat | Mitigation |
|---|---|
| DB dump / SQL injection read of `api_key_ciphertext` | AES-256-GCM ciphertext is useless without the env key |
| Tampering with stored ciphertext | GCM auth tag verification fails decryption |
| Accidental exposure via API | Last-4 only, enforced in every serialization |
| Key loss | Connections can be re-keyed from the UI ("Re-enter key"); historical data is unaffected |
| Accidental commit of secrets | `.env*` is gitignored; CI injects its own dummy keys |

## Verification

```bash
node -e "
const {encryptSecret, decryptSecret} = require('./src/lib/crypto.ts');
const ct = encryptSecret('sk-test-1234');
console.log(ct.split(':').length === 3 ? 'format ok' : 'bad');
console.log(decryptSecret(ct) === 'sk-test-1234' ? 'roundtrip ok' : 'bad');
"
```
