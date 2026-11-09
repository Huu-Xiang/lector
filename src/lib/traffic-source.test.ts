import { describe, expect, it } from 'vitest';
import { SOURCES as API_SOURCES } from '../../api/src/lib/source-list';
import {
  SOURCES,
  classifySource,
  hasSourceCookie,
  isCountedRoute,
  languageBucket,
  looksLikeBot,
  sourceCookieString,
} from './traffic-source';

const classify = (utmSource: string | null, referrer = '') =>
  classifySource({ utmSource, referrer, ownHost: 'readfox.app' });

describe('classifySource', () => {
  it('keeps the client list equal to the server list', () => {
    expect([...SOURCES]).toEqual([...API_SOURCES]);
  });

  it('reads utm_source first, with aliases', () => {
    expect(classify('Google', 'https://www.bing.com/')).toBe('google');
    expect(classify('xhs')).toBe('xiaohongshu');
    expect(classify('twitter')).toBe('x');
    expect(classify('weixin')).toBe('wechat');
  });

  it('maps an unknown utm_source to other', () => {
    expect(classify('newsletter-42')).toBe('other');
    expect(classify('<script>')).toBe('other');
  });

  it('reads the referrer host', () => {
    expect(classify(null, 'https://www.google.co.uk/search?q=x')).toBe('google');
    expect(classify(null, 'https://www.baidu.com/s?wd=x')).toBe('baidu');
    expect(classify(null, 'https://www.xiaohongshu.com/explore/1')).toBe('xiaohongshu');
    expect(classify(null, 'https://mp.weixin.qq.com/s/abc')).toBe('wechat');
    expect(classify(null, 'https://old.reddit.com/r/languagelearning')).toBe('reddit');
    expect(classify(null, 'https://t.co/abc')).toBe('x');
    expect(classify(null, 'https://chat.openai.com/')).toBe('chatgpt');
    expect(classify(null, 'https://www.perplexity.ai/search')).toBe('perplexity');
    expect(classify(null, 'https://claude.ai/chat/1')).toBe('claude');
  });

  it('does not match look-alike hosts', () => {
    expect(classify(null, 'https://notgoogle.com/')).toBe('other');
    expect(classify(null, 'https://google.com.evil.example/')).toBe('other');
  });

  it('treats no referrer, a bad referrer and the own host as direct', () => {
    expect(classify(null, '')).toBe('direct');
    expect(classify(null, 'not a url')).toBe('direct');
    expect(classify(null, 'https://readfox.app/pricing')).toBe('direct');
  });

  it('maps any other host to other', () => {
    expect(classify(null, 'https://blog.example.org/post')).toBe('other');
  });
});

describe('languageBucket', () => {
  it('splits Chinese from the rest', () => {
    expect(languageBucket('zh-CN')).toBe('zh');
    expect(languageBucket('zh')).toBe('zh');
    expect(languageBucket('en-US')).toBe('other');
    expect(languageBucket(undefined)).toBe('other');
  });
});

describe('looksLikeBot', () => {
  it('flags webdriver and bot user agents', () => {
    expect(looksLikeBot('Mozilla/5.0 Chrome/120', true)).toBe(true);
    expect(looksLikeBot('Mozilla/5.0 (compatible; Googlebot/2.1)', false)).toBe(true);
    expect(looksLikeBot('HeadlessChrome/120', undefined)).toBe(true);
    expect(looksLikeBot('Mozilla/5.0 (iPhone) Safari/604.1', false)).toBe(false);
  });
});

describe('cookie', () => {
  it('holds only source.lang, for 30 days, SameSite=Lax', () => {
    const cookie = sourceCookieString('google', 'zh', true);
    expect(cookie).toBe('rf_src=google.zh; Max-Age=2592000; Path=/; SameSite=Lax; Secure');
    expect(sourceCookieString('direct', 'other', false)).not.toContain('Secure');
  });

  it('detects its own cookie', () => {
    expect(hasSourceCookie('a=1; rf_src=google.zh')).toBe(true);
    expect(hasSourceCookie('a=1; xrf_src=google.zh')).toBe(false);
    expect(hasSourceCookie('')).toBe(false);
  });
});

describe('isCountedRoute', () => {
  it('counts public marketing pages and register only', () => {
    expect(isCountedRoute('/landing', true)).toBe(true);
    expect(isCountedRoute('/books/en/some-book', true)).toBe(true);
    expect(isCountedRoute('/register', true)).toBe(true);
    expect(isCountedRoute('/login', true)).toBe(false);
    expect(isCountedRoute('/checkout', true)).toBe(false);
    expect(isCountedRoute('/read/1', false)).toBe(false);
  });
});
