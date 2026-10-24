/**
 * Human-readable hold wording. HOLD_SECONDS is configuration, so customer
 * copy should not silently claim "two minutes" when an operator changes it.
 */
export function formatHoldDuration(seconds: number): string {
  const safeSeconds = Math.max(1, Math.round(seconds));
  if (safeSeconds < 60) {
    return `${safeSeconds}-second`;
  }
  const minutes = safeSeconds / 60;
  if (Number.isInteger(minutes)) {
    return `${minutes}-minute`;
  }
  return `${Math.round(minutes)}-minute`;
}
