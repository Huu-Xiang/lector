export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export type PasswordProblem = 'too_short' | 'too_long' | 'needs_letter' | 'needs_digit';

/** First rule a new password breaks, or null. Mirrored by src/lib/password-strength.ts. */
export function passwordProblem(password: unknown): PasswordProblem | null {
  if (typeof password !== 'string') return 'too_short';
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short';
  if (password.length > MAX_PASSWORD_LENGTH) return 'too_long';
  if (!/\p{L}/u.test(password)) return 'needs_letter';
  if (!/\p{N}/u.test(password)) return 'needs_digit';
  return null;
}

const MESSAGES: Record<PasswordProblem, string> = {
  too_short: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  too_long: `Password must be at most ${MAX_PASSWORD_LENGTH} characters`,
  needs_letter: 'Password must contain a letter',
  needs_digit: 'Password must contain a digit',
};

export function passwordProblemMessage(problem: PasswordProblem): string {
  return MESSAGES[problem];
}
