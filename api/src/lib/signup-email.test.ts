import { describe, test, expect } from 'bun:test';
import { aliasDomains, canonicalEmail, isDisposableEmail } from './signup-email';

describe('canonicalEmail', () => {
  test('drops +tags and Gmail dots', () => {
    expect(canonicalEmail('Me.Name+test@Gmail.com')).toBe('mename@gmail.com');
    expect(canonicalEmail('me.name@googlemail.com')).toBe('mename@gmail.com');
    expect(canonicalEmail('first.last+x@outlook.com')).toBe('first.last@outlook.com');
  });
});

describe('isDisposableEmail', () => {
  test('flags throwaway domains only', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@qq.com')).toBe(false);
  });
});

describe('aliasDomains', () => {
  test('Gmail covers both domains', () => {
    expect(aliasDomains('a@googlemail.com').sort()).toEqual(['gmail.com', 'googlemail.com']);
    expect(aliasDomains('a@163.com')).toEqual(['163.com']);
  });
});
