/**
 * Normalise to digits in international format without "+" (what WhatsApp JIDs use).
 * Numbers starting with a single 0 are treated as Swedish local numbers.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `46${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}
