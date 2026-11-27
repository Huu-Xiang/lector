import { describe, expect, it } from 'vitest';
import { isAuthRoute } from './api-base';
import {
  ALTERNATIVE_COMPETITORS,
  WAVE3_ALTERNATIVE_COMPETITORS,
  alternativeJsonLd,
  alternativePath,
  alternativesHubJsonLd,
  isAlternativeCompetitor,
  isLingqVariant,
} from './alternatives';
import { getWave3AlternativeContent } from './alternatives-wave3';

describe('alternatives', () => {
  it('supports all core and Wave 3 competitors and rejects unknown slugs', () => {
    expect(ALTERNATIVE_COMPETITORS).toEqual([
      'lingq',
      'readlang',
      'lute',
      'duolingo',
      'lingq-for-japanese',
      'lingq-for-korean',
      'lingq-for-french',
    ]);
    for (const slug of ALTERNATIVE_COMPETITORS) {
      expect(isAlternativeCompetitor(slug)).toBe(true);
      expect(alternativePath(slug)).toBe(`/alternatives/${slug}`);
    }
    expect(isAlternativeCompetitor('unknown-app')).toBe(false);
    expect(isLingqVariant('lingq')).toBe(true);
    expect(isLingqVariant('lingq-for-korean')).toBe(true);
    expect(isLingqVariant('lute')).toBe(false);
  });

  it('interpolates all Wave 3 alternative content cleanly across all 6 UI locales', () => {
    for (const competitor of WAVE3_ALTERNATIVE_COMPETITORS) {
      for (const locale of ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ru']) {
        const content = getWave3AlternativeContent(competitor, locale, {
          books: 277,
          plusPrice: '$3',
          freeLookups: '1,000',
          freeDetailed: 20,
        });
        expect(content.title.trim().length).toBeGreaterThan(0);
        expect(content.summary).not.toContain('{books}');
        expect(content.summary).not.toContain('{plusPrice}');
        expect(content.faq.length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('marks /alternatives routes as public auth-exempt routes', () => {
    expect(isAuthRoute('/alternatives')).toBe(true);
    expect(isAuthRoute('/alternatives/lingq')).toBe(true);
    expect(isAuthRoute('/alternatives/lute')).toBe(true);
    expect(isAuthRoute('/alternatives/lingq-for-korean')).toBe(true);
  });

  it('emits SoftwareApplication, FAQPage, and localized BreadcrumbList structured data', () => {
    const ld = alternativeJsonLd({
      competitor: 'lingq-for-japanese',
      url: 'https://readfox.app/ja/alternatives/lingq-for-japanese',
      title: 'Readfox vs LingQ (Japanese)',
      description: 'Compare Readfox and LingQ for Japanese.',
      allLabel: 'Home',
      hubLabel: 'Alternatives',
      localePrefix: '/ja',
      inLanguage: 'ja',
      faq: [{ q: 'Can I import LingQ words?', a: 'Yes, via CSV.' }],
    });
    expect(ld.map((item) => item['@type'])).toEqual([
      'SoftwareApplication',
      'FAQPage',
      'BreadcrumbList',
    ]);
    const software = ld[0] as { isSimilarTo: { name: string } };
    expect(software.isSimilarTo.name).toBe('LingQ');
    const faq = ld[1] as { mainEntity: Array<{ name: string }> };
    expect(faq.mainEntity[0]?.name).toBe('Can I import LingQ words?');
    const breadcrumb = ld[2] as { itemListElement: Array<{ item: string; position: number }> };
    expect(breadcrumb.itemListElement.map((e) => e.item)).toEqual([
      'https://readfox.app/ja',
      'https://readfox.app/ja/alternatives',
      'https://readfox.app/ja/alternatives/lingq-for-japanese',
    ]);
  });

  it('emits CollectionPage, ItemList, and BreadcrumbList for /alternatives hub', () => {
    const ld = alternativesHubJsonLd({
      url: 'https://readfox.app/zh-cn/alternatives',
      title: 'How Readfox compares',
      description: 'Compare Readfox with LingQ, Readlang, Lute, and Duolingo.',
      homeLabel: 'Readfox',
      hubLabel: 'Alternatives',
      localePrefix: '/zh-cn',
      inLanguage: 'zh-CN',
      items: [
        {
          name: 'Readfox vs LingQ',
          url: 'https://readfox.app/zh-cn/alternatives/lingq',
          description: 'Compare with LingQ.',
        },
      ],
    });
    expect(ld.map((item) => item['@type'])).toEqual([
      'CollectionPage',
      'ItemList',
      'BreadcrumbList',
    ]);
    const breadcrumb = ld[2] as { itemListElement: Array<{ item: string }> };
    expect(breadcrumb.itemListElement.map((e) => e.item)).toEqual([
      'https://readfox.app/zh-cn',
      'https://readfox.app/zh-cn/alternatives',
    ]);
  });
});
