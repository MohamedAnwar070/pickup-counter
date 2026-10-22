/**
 * Pure function to calculate remaining seconds until an expiration timestamp.
 * Returns integer seconds, clamped to 0 if expired.
 */
export function secondsLeft(expiresAt: Date | string, now: Date = new Date()): number {
  const expires = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const diffMs = expires.getTime() - now.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.ceil(diffMs / 1000);
}
