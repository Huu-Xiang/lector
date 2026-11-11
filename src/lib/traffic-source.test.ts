import { describe, expect, it } from 'vitest';
import { LANGS as API_LANGS, SOURCES as API_SOURCES } from '../../api/src/lib/source-list';
import {
  LANGS,
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
    expect([...LANGS]).toEqual([...API_LANGS]);
  });

  it('has no duplicate names', () => {
    expect(new Set(SOURCES).size).toBe(SOURCES.length);
    expect(new Set(LANGS).size).toBe(LANGS.length);
  });

  it('reads utm_source first, with aliases', () => {
    expect(classify('Google', 'https://www.bing.com/')).toBe('google');
    expect(classify('xhs')).toBe('xiaohongshu');
    expect(classify('twitter')).toBe('x');
    expect(classify('weixin')).toBe('wechat');
  });

  it('maps an unmatched utm_source to campaign', () => {
    expect(classify('newsletter-42')).toBe('campaign');
    expect(classify('<script>')).toBe('campaign');
    expect(classify('direct')).toBe('campaign');
    expect(classify('other')).toBe('campaign');
    expect(classify('  ')).toBe('direct');
  });

  it('maps utm_source names and aliases to channels', () => {
    expect(classify('DeepSeek')).toBe('deepseek');
    expect(classify('hn')).toBe('hackernews');
    expect(classify('email')).toBe('email');
    expect(classify('newsletter')).toBe('email');
    expect(classify('zhihu', 'https://www.google.com/')).toBe('zhihu');
  });

  it.each([
    ['https://www.google.co.jp/', 'google'],
    ['https://www.google.com.hk/search', 'google'],
    ['https://google.de/', 'google'],
    ['https://cn.bing.com/search?q=x', 'bing'],
    ['https://duckduckgo.com/', 'duckduckgo'],
    ['https://yandex.ru/search', 'yandex'],
    ['https://yandex.com.tr/', 'yandex'],
    ['https://www.sogou.com/web', 'sogou'],
    ['https://www.so.com/s?q=x', 'so360'],
    ['https://search.yahoo.com/', 'yahoo'],
    ['https://search.yahoo.co.jp/', 'yahoo'],
    ['https://search.naver.com/', 'naver'],
    ['https://www.ecosia.org/', 'ecosia'],
    ['https://search.brave.com/', 'brave'],
    ['https://chatgpt.com/', 'chatgpt'],
    ['https://gemini.google.com/app', 'gemini'],
    ['https://copilot.microsoft.com/', 'copilot'],
    ['https://chat.deepseek.com/', 'deepseek'],
    ['https://www.kimi.com/', 'kimi'],
    ['https://www.doubao.com/chat', 'doubao'],
    ['https://xhslink.com/abc', 'xiaohongshu'],
    ['https://www.zhihu.com/question/1', 'zhihu'],
    ['https://weibo.com/1', 'weibo'],
    ['https://www.douban.com/group/1', 'douban'],
    ['https://www.bilibili.com/video/BV1', 'bilibili'],
    ['https://www.v2ex.com/t/1', 'v2ex'],
    ['https://www.appinn.com/', 'appinn'],
    ['https://sspai.com/post/1', 'sspai'],
    ['https://juejin.cn/post/1', 'juejin'],
    ['https://weixin.qq.com/', 'wechat'],
    ['https://l.facebook.com/l.php', 'facebook'],
    ['https://www.instagram.com/', 'instagram'],
    ['https://www.linkedin.com/feed', 'linkedin'],
    ['https://www.youtube.com/watch', 'youtube'],
    ['https://github.com/Huu-Xiang/lector', 'github'],
    ['https://news.ycombinator.com/item?id=1', 'hackernews'],
    ['https://www.producthunt.com/posts/x', 'producthunt'],
    ['https://t.me/channel', 'telegram'],
    ['https://discord.com/channels/1', 'discord'],
    ['https://twitter.com/x/status/1', 'x'],
    ['https://mail.google.com/mail/u/0/', 'email'],
    ['https://outlook.live.com/mail/', 'email'],
    ['https://mail.qq.com/cgi-bin/frame_html', 'email'],
    ['https://mail.163.com/', 'email'],
    ['https://WWW.GOOGLE.COM/', 'google'],
  ])('maps %s to %s', (referrer, expected) => {
    expect(classify(null, referrer)).toBe(expected);
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
    expect(classify(null, 'https://notgemini.google.com.example/')).toBe('other');
    expect(classify(null, 'https://evilmail.example.com/')).toBe('other');
    expect(classify(null, 'https://mybing.com/')).toBe('other');
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
  it.each([
    ['zh-CN', 'zh'],
    ['zh', 'zh'],
    ['zh-Hant-TW', 'zh'],
    ['en-US', 'en'],
    ['EN-gb', 'en'],
    ['ja-JP', 'ja'],
    ['ko', 'ko'],
    ['ar-EG', 'ar'],
    ['ru-RU', 'ru'],
    ['fr-CA', 'fr'],
    ['es-419', 'es'],
    ['de-AT', 'de'],
    ['pt-BR', 'pt'],
    ['it', 'it'],
    ['tr-TR', 'tr'],
    ['vi-VN', 'vi'],
    ['id-ID', 'id'],
    ['in-ID', 'id'],
    ['th-TH', 'th'],
    ['hi-IN', 'hi'],
    ['en_US', 'en'],
  ])('maps %s to %s', (tag, expected) => {
    expect(languageBucket(tag)).toBe(expected);
  });

  it('maps other, empty and unknown tags to other', () => {
    expect(languageBucket('pl-PL')).toBe('other');
    expect(languageBucket('other')).toBe('other');
    expect(languageBucket('')).toBe('other');
    expect(languageBucket(undefined)).toBe('other');
    expect(languageBucket('<script>')).toBe('other');
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
