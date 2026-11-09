import { describe, expect, test } from 'bun:test';
import { shortenIp } from './ip-privacy';

describe('shortenIp', () => {
  test('keeps the first three parts of an IPv4 address', () => {
    expect(shortenIp('203.0.113.77')).toBe('203.0.113.0');
    expect(shortenIp(' 10.1.2.3 ')).toBe('10.1.2.0');
  });

  test('keeps the first 48 bits of an IPv6 address', () => {
    expect(shortenIp('2001:0db8:0001:ffff:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1::');
    expect(shortenIp('2001:db8:abcd::1')).toBe('2001:db8:abcd::');
    expect(shortenIp('2001:db8::1')).toBe('2001:db8:0::');
    expect(shortenIp('::1')).toBe('0:0:0::');
    expect(shortenIp('FE80::1%en0')).toBe('fe80:0:0::');
  });

  test('treats an IPv4-mapped IPv6 address as IPv4', () => {
    expect(shortenIp('::ffff:203.0.113.77')).toBe('203.0.113.0');
  });

  test('returns an empty string for anything else', () => {
    expect(shortenIp('')).toBe('');
    expect(shortenIp(null)).toBe('');
    expect(shortenIp(undefined)).toBe('');
    expect(shortenIp('not-an-ip')).toBe('');
    expect(shortenIp('999.1.1.1')).toBe('');
  });
});
