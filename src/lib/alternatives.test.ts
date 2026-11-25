import { describe, expect, it } from 'vitest';
import { isAuthRoute } from './api-base';
import {
  ALTERNATIVE_COMPETITORS,
  alternativeJsonLd,
  alternativePath,
  alternativesHubJsonLd,
  isAlternativeCompetitor,
} from './alternatives';

describe('alternatives', () => {
  it('supports lingq and readlang and rejects unknown competitors', () => {
    expect(ALTERNATIVE_COMPETITORS).toEqual(['lingq', 'readlang']);
    expect(isAlternativeCompetitor('lingq')).toBe(true);
    expect(isAlternativeCompetitor('readlang')).toBe(true);
    expect(isAlternativeCompetitor('duolingo')).toBe(false);
    expect(alternativePath('lingq')).toBe('/alternatives/lingq');
    expect(alternativePath('readlang')).toBe('/alternatives/readlang');
  });

  it('marks /alternatives routes as public auth-exempt routes', () => {
    expect(isAuthRoute('/alternatives')).toBe(true);
    expect(isAuthRoute('/alternatives/lingq')).toBe(true);
    expect(isAuthRoute('/alternatives/readlang')).toBe(true);
  });

  it('emits SoftwareApplication, FAQPage, and localized BreadcrumbList structured data', () => {
    const ld = alternativeJsonLd({
      competitor: 'lingq',
      url: 'https://readfox.app/ja/alternatives/lingq',
      title: 'Readfox vs LingQ',
      description: 'Compare Readfox and LingQ.',
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
    const faq = ld[1] as { mainEntity: Array<{ name: string }> };
    expect(faq.mainEntity[0]?.name).toBe('Can I import LingQ words?');
    const breadcrumb = ld[2] as { itemListElement: Array<{ item: string; position: number }> };
    expect(breadcrumb.itemListElement.map((e) => e.item)).toEqual([
      'https://readfox.app/ja',
      'https://readfox.app/ja/alternatives',
      'https://readfox.app/ja/alternatives/lingq',
    ]);
  });

  it('emits CollectionPage, ItemList, and BreadcrumbList for /alternatives hub', () => {
    const ld = alternativesHubJsonLd({
      url: 'https://readfox.app/zh-cn/alternatives',
      title: 'How Readfox compares',
      description: 'Compare Readfox with LingQ and Readlang.',
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
