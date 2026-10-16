import { describe, expect, it } from 'vitest';
import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps two characters of a long name and the domain', () => {
    expect(maskEmail('xianghu@gmail.com')).toBe('xi***@gmail.com');
  });

  it('keeps one character of a short name, and hides a malformed address', () => {
    expect(maskEmail('abc@x.io')).toBe('a***@x.io');
    expect(maskEmail('nope')).toBe('***');
  });
});
