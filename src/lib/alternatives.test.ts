import { describe, expect, it } from 'vitest';
import { isAuthRoute } from './api-base';
import {
  ALTERNATIVE_COMPETITORS,
  alternativeJsonLd,
  alternativePath,
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
    expect(isAuthRoute('/alternatives/lingq')).toBe(true);
    expect(isAuthRoute('/alternatives/readlang')).toBe(true);
  });

  it('emits SoftwareApplication, FAQPage, and BreadcrumbList structured data', () => {
    const ld = alternativeJsonLd({
      competitor: 'lingq',
      url: 'https://readfox.app/alternatives/lingq',
      title: 'Readfox vs LingQ',
      description: 'Compare Readfox and LingQ.',
      allLabel: 'Home',
      faq: [{ q: 'Can I import LingQ words?', a: 'Yes, via CSV.' }],
    });
    expect(ld.map((item) => item['@type'])).toEqual([
      'SoftwareApplication',
      'FAQPage',
      'BreadcrumbList',
    ]);
    const faq = ld[1] as { mainEntity: Array<{ name: string }> };
    expect(faq.mainEntity[0]?.name).toBe('Can I import LingQ words?');
  });
});
