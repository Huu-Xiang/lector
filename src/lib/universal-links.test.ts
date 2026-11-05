import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppLink } from './universal-links';

describe('resolveAppLink', () => {
  it('accepts the verify, reset, and invite links on readfox.app', () => {
    expect(
      resolveAppLink('https://readfox.app/api/auth/verify-email?token=abc&callbackURL=/'),
    ).toBe('/api/auth/verify-email?token=abc&callbackURL=/');
    expect(
      resolveAppLink(
        'https://readfox.app/api/auth/reset-password/tok123?callbackURL=/reset-password',
      ),
    ).toBe('/api/auth/reset-password/tok123?callbackURL=/reset-password');
    expect(resolveAppLink('https://readfox.app/reset-password?token=abc')).toBe(
      '/reset-password?token=abc',
    );
    expect(resolveAppLink('https://readfox.app/register?invite=ABCD')).toBe(
      '/register?invite=ABCD',
    );
  });

  it('accepts a verify link whose callback is on readfox.app', () => {
    const link =
      'https://readfox.app/api/auth/verify-email?token=a&callbackURL=https%3A%2F%2Freadfox.app%2F';
    expect(resolveAppLink(link)).toBe(
      '/api/auth/verify-email?token=a&callbackURL=https%3A%2F%2Freadfox.app%2F',
    );
  });

  it('turns the share link into the share page', () => {
    expect(resolveAppLink('readfox://share?url=https%3A%2F%2Fexample.com%2Fa')).toBe(
      '/share?url=https%3A%2F%2Fexample.com%2Fa',
    );
  });

  it('turns the widget link into the practice page and drops its query', () => {
    expect(resolveAppLink('readfox://practice')).toBe('/practice');
    expect(resolveAppLink('readfox://practice?next=https%3A%2F%2Fevil.example')).toBe('/practice');
  });

  it('drops another host, an unlisted path, and other custom links', () => {
    expect(resolveAppLink('https://evil.example/register?invite=x')).toBeNull();
    expect(resolveAppLink('https://readfox.app.evil.example/register')).toBeNull();
    expect(resolveAppLink('https://readfox.app/checkout')).toBeNull();
    expect(resolveAppLink('https://readfox.app/settings')).toBeNull();
    expect(resolveAppLink('readfox://checkout')).toBeNull();
    expect(resolveAppLink('http://readfox.app/register')).toBeNull();
    expect(resolveAppLink('not a url')).toBeNull();
  });

  it('drops a link whose redirect parameter leaves the site', () => {
    expect(
      resolveAppLink(
        'https://readfox.app/api/auth/verify-email?token=a&callbackURL=https://evil.example/',
      ),
    ).toBeNull();
    expect(
      resolveAppLink(
        'https://readfox.app/api/auth/verify-email?token=a&callbackURL=//evil.example',
      ),
    ).toBeNull();
    expect(resolveAppLink('https://readfox.app/register?next=https://evil.example')).toBeNull();
  });
});

describe('apple-app-site-association', () => {
  const file = JSON.parse(
    readFileSync(join(process.cwd(), 'public/.well-known/apple-app-site-association'), 'utf8'),
  ) as {
    applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] };
  };
  const detail = file.applinks.details[0];

  it('names the app and lists specific paths only', () => {
    expect(detail.appIDs[0]).toMatch(/\.app\.readfox\.ios$/);
    for (const { '/': path } of detail.components) {
      expect(path).not.toBe('/*');
      expect(path.startsWith('/')).toBe(true);
    }
  });

  it('lists exactly the paths the app accepts', () => {
    for (const { '/': path } of detail.components) {
      const sample = `https://readfox.app${path.replace('*', 'x')}`;
      expect(resolveAppLink(sample), path).not.toBeNull();
    }
  });
});
