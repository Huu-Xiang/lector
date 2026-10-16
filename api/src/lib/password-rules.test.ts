import '../test-guard';
import { describe, expect, test } from 'bun:test';
import { passwordProblem } from './password-rules';

describe('passwordProblem', () => {
  test('accepts letters plus a digit of 8 to 128 characters', () => {
    expect(passwordProblem('abcdefg1')).toBeNull();
    expect(passwordProblem('密码密码密码密码a1')).toBeNull();
  });

  test('names the first broken rule', () => {
    expect(passwordProblem('abc1')).toBe('too_short');
    expect(passwordProblem('12345678')).toBe('needs_letter');
    expect(passwordProblem('abcdefgh')).toBe('needs_digit');
    expect(passwordProblem('a1'.repeat(70))).toBe('too_long');
    expect(passwordProblem(undefined)).toBe('too_short');
  });
});
