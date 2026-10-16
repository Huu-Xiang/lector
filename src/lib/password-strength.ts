export type PasswordRule = 'length' | 'letter' | 'digit';
export type PasswordStrength = 'empty' | 'weak' | 'fair' | 'strong';

export const MIN_PASSWORD_LENGTH = 8;

/** Mirrors api/src/lib/password-rules.ts: the server enforces the same three rules. */
export function passedRules(password: string): Record<PasswordRule, boolean> {
  return {
    length: password.length >= MIN_PASSWORD_LENGTH,
    letter: /\p{L}/u.test(password),
    digit: /\p{N}/u.test(password),
  };
}

export function meetsRules(password: string): boolean {
  return Object.values(passedRules(password)).every(Boolean);
}

export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) return 'empty';
  if (!meetsRules(password)) return 'weak';
  let points = 0;
  if (password.length >= 12) points += 1;
  if (/\p{Lu}/u.test(password) && /\p{Ll}/u.test(password)) points += 1;
  if (/[^\p{L}\p{N}]/u.test(password)) points += 1;
  return points >= 2 ? 'strong' : 'fair';
}
