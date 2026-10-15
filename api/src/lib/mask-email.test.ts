import { describe, expect, test } from 'bun:test';
import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  test('keeps two letters of a long name and the whole domain', () => {
    expect(maskEmail('xianghu0605@gmail.com')).toBe('xi***@gmail.com');
  });

  test('keeps one letter of a short name', () => {
    expect(maskEmail('ab@x.org')).toBe('a***@x.org');
    expect(maskEmail('a@x.org')).toBe('a***@x.org');
  });

  test('hides everything when there is no usable name', () => {
    expect(maskEmail('nonsense')).toBe('***');
    expect(maskEmail('@x.org')).toBe('***');
  });
});
