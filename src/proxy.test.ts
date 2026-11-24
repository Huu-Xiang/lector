import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

const ORIGINAL_BETA = process.env.READFOX_BETA_NOTICE;
const ORIGINAL_NOINDEX = process.env.READFOX_NOINDEX;

afterEach(() => {
  if (ORIGINAL_BETA === undefined) delete process.env.READFOX_BETA_NOTICE;
  else process.env.READFOX_BETA_NOTICE = ORIGINAL_BETA;
  if (ORIGINAL_NOINDEX === undefined) delete process.env.READFOX_NOINDEX;
  else process.env.READFOX_NOINDEX = ORIGINAL_NOINDEX;
});

describe('Next.js 16 proxy', () => {
  it('rewrites localized public routes and sets locale headers', () => {
    delete process.env.READFOX_BETA_NOTICE;
    delete process.env.READFOX_NOINDEX;

    const req = new NextRequest('https://readfox.app/zh-cn/vocab-test');
    const res = proxy(req);
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://readfox.app/vocab-test');
    expect(res.headers.get('x-middleware-request-x-readfox-locale')).toBe('zh-CN');
    expect(res.headers.get('x-middleware-request-x-readfox-locale-prefix')).toBe('/zh-cn');
    expect(res.headers.get('x-robots-tag')).toBeNull();
  });

  it('rewrites bare localized home paths to /landing', () => {
    delete process.env.READFOX_BETA_NOTICE;
    const req = new NextRequest('https://readfox.app/ja');
    const res = proxy(req);
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://readfox.app/landing');
    expect(res.headers.get('x-middleware-request-x-readfox-locale')).toBe('ja');
    expect(res.headers.get('x-middleware-request-x-readfox-locale-prefix')).toBe('/ja');
  });

  it('passes through unprefixed and non-public routes untouched', () => {
    delete process.env.READFOX_BETA_NOTICE;
    const req = new NextRequest('https://readfox.app/books/en');
    const res = proxy(req);
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-readfox-locale')).toBeNull();
  });

  it('adds X-Robots-Tag: noindex, nofollow on beta/test deployments', () => {
    process.env.READFOX_BETA_NOTICE = '1';
    const req = new NextRequest('https://test.readfox.app/zh-cn/alternatives/lingq');
    const res = proxy(req);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('x-middleware-rewrite')).toBe(
      'https://test.readfox.app/alternatives/lingq',
    );
  });
});
