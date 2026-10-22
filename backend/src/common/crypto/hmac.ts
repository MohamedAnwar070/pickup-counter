import * as crypto from 'crypto';

/**
 * Verifies hex HMAC-SHA256 signature against raw request body using constant-time comparison.
 * Returns false if header is missing, wrong length, non-hex, or does not match.
 */
export function verifySignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !header || !secret) {
    return false;
  }

  // Header must be a valid hex string of expected length (64 hex characters for sha256 = 32 bytes)
  if (!/^[0-9a-fA-F]{64}$/.test(header)) {
    return false;
  }

  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
    const given = Buffer.from(header, 'hex');

    if (given.length !== expected.length) {
      return false;
    }

    return crypto.timingSafeEqual(given, expected);
  } catch {
    return false;
  }
}

/**
 * Creates hex HMAC-SHA256 signature for a payload and secret.
 */
export function signPayload(payload: Buffer | string, secret: string): string {
  const buf = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  return crypto.createHmac('sha256', secret).update(buf).digest('hex');
}
