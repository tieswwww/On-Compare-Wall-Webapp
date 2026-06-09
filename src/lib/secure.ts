/**
 * Constant-time string comparison for secrets (tokens, passwords).
 *
 * Bails out immediately when the lengths differ, but otherwise compares every
 * character with no early exit — so the time taken doesn't leak how many
 * leading characters matched. Use this instead of `===` / `!==` when checking
 * a caller-supplied value against a server-side secret.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
