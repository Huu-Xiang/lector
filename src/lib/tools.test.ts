import { describe, expect, it } from 'vitest';
import { isAuthRoute } from './api-base';
import {
  ALL_PUBLIC_TOOL_PATHS,
  WORKFLOW_TOOL_SLUGS,
  getToolsUi,
  getWorkflowToolContent,
  isWorkflowToolSlug,
  toolPageJsonLd,
  toolPath,
  toolsHubJsonLd,
} from './tools';

describe('tools', () => {
  it('supports all workflow slugs and rejects unknown slugs', () => {
    expect(WORKFLOW_TOOL_SLUGS).toEqual([
      'epub-reader-ai-dictionary',
      'youtube-language-reader',
      'anki-reading-workflow',
    ]);
    for (const slug of WORKFLOW_TOOL_SLUGS) {
      expect(isWorkflowToolSlug(slug)).toBe(true);
      expect(toolPath(slug)).toBe(`/tools/${slug}`);
    }
    expect(isWorkflowToolSlug('unknown-tool')).toBe(false);
    expect(ALL_PUBLIC_TOOL_PATHS).toContain('/tools');
    expect(ALL_PUBLIC_TOOL_PATHS).toContain('/tools/text-difficulty');
  });

  it('marks /tools routes as auth-exempt in isAuthRoute', () => {
    expect(isAuthRoute('/tools')).toBe(true);
    expect(isAuthRoute('/tools/text-difficulty')).toBe(true);
    expect(isAuthRoute('/tools/epub-reader-ai-dictionary')).toBe(true);
    expect(isAuthRoute('/zh-cn/tools/text-difficulty')).toBe(true);
    expect(isAuthRoute('/ja/tools/anki-reading-workflow')).toBe(true);
  });

  it('provides localized UI strings and interactive preview words across locales', () => {
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ru']) {
      const ui = getToolsUi(locale);
      expect(ui.hubTitle.trim().length).toBeGreaterThan(0);
      expect(ui.diffTitle.trim().length).toBeGreaterThan(0);
    }

    for (const slug of WORKFLOW_TOOL_SLUGS) {
      const content = getWorkflowToolContent(slug, 'zh-CN', {
        books: 277,
        freeLookups: '1,000',
        freeDetailed: 20,
      });
      expect(content.previewWords.length).toBeGreaterThanOrEqual(3);
      expect(content.steps.length).toBe(3);
      expect(content.faq.length).toBeGreaterThanOrEqual(3);
      expect(content.summary).not.toContain('{books}');
    }
  });

  it('emits valid structured data for tool pages and tools hub', () => {
    const ld = toolPageJsonLd({
      url: 'https://readfox.app/zh-cn/tools/text-difficulty',
      title: 'CEFR 文本难度检测器',
      description: 'Estimate CEFR level.',
      homeLabel: 'Readfox',
      toolsLabel: '免费工具',
      localePrefix: '/zh-cn',
      inLanguage: 'zh-CN',
      faq: [{ q: 'How does it work?', a: 'Word frequency + sentence length.' }],
      isWebApp: true,
    });
    expect(ld.map((item) => item['@type'])).toEqual([
      'WebApplication',
      'BreadcrumbList',
      'FAQPage',
    ]);

    const hub = toolsHubJsonLd({
      url: 'https://readfox.app/tools',
      title: 'Free language reading tools',
      description: 'Tools hub',
      homeLabel: 'Readfox',
      toolsLabel: 'Free Tools',
      items: [
        {
          name: 'CEFR Text Difficulty Checker',
          url: 'https://readfox.app/tools/text-difficulty',
          description: 'Check text difficulty',
        },
      ],
    });
    expect(hub.map((item) => item['@type'])).toEqual([
      'CollectionPage',
      'ItemList',
      'BreadcrumbList',
    ]);
  });
});
