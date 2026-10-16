import { describe, expect, it } from 'vitest';
import { meetsRules, passedRules, passwordStrength } from './password-strength';

describe('password rules', () => {
  it('needs 8 characters, a letter and a digit', () => {
    expect(passedRules('abc1')).toEqual({ length: false, letter: true, digit: true });
    expect(meetsRules('abcdefg1')).toBe(true);
    expect(meetsRules('abcdefgh')).toBe(false);
    expect(meetsRules('12345678')).toBe(false);
  });
});

describe('password strength', () => {
  it('grades by rules, length, case and symbols', () => {
    expect(passwordStrength('')).toBe('empty');
    expect(passwordStrength('abc1')).toBe('weak');
    expect(passwordStrength('abcdefg1')).toBe('fair');
    expect(passwordStrength('Abcdefg1')).toBe('fair');
    expect(passwordStrength('Abcdefg1!')).toBe('strong');
    expect(passwordStrength('abcdefghijk1')).toBe('fair');
    expect(passwordStrength('abcdefghijk1!')).toBe('strong');
  });
});
