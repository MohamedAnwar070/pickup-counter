/**
 * Convert rupees to integer paise without floating point issues.
 * E.g., 12.34 -> 1234
 */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Convert integer paise to decimal rupees.
 * E.g., 1234 -> 12.34
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Format integer paise into a human-readable rupee string.
 * Example: 1234 -> "₹12.34", 1200 -> "₹12.00"
 */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}
