import { expect, test } from '@playwright/test';

test.describe('passive SEO and GEO public pages', () => {
  test('alternatives pages render SSR comparison content, LingQ CSV migration, and JSON-LD', async ({
    page,
    request,
  }) => {
    const lingqRes = await request.get('/alternatives/lingq');
    expect(lingqRes.status()).toBe(200);
    const lingqHtml = await lingqRes.text();
    expect(lingqHtml).toContain('"@type":"FAQPage"');
    expect(lingqHtml).toContain('"@type":"SoftwareApplication"');
    expect(lingqHtml).toContain('https://readfox.app/alternatives/lingq');
    expect(lingqHtml).toContain('hrefLang="zh-CN"');

    await page.goto('/alternatives/lingq');
    await expect(page.getByTestId('alt-comparison-table')).toBeVisible();
    await expect(page.getByTestId('alt-lingq-import')).toBeVisible();
    await expect(page.getByTestId('alt-cta-books')).toHaveAttribute('href', '/books');
    await expect(page.getByTestId('alt-cta-vocab')).toHaveAttribute('href', '/vocab-test');

    await page.goto('/alternatives/readlang');
    await expect(page.getByTestId('alt-comparison-table')).toBeVisible();
    await expect(page.getByTestId('alt-lingq-import')).toHaveCount(0);
  });

  test('localized public URLs render deterministically without cookies or Accept-Language', async ({
    request,
  }) => {
    const zhVocab = await request.get('/zh-cn/vocab-test', {
      headers: { 'accept-language': '' },
    });
    expect(zhVocab.status()).toBe(200);
    const html = await zhVocab.text();
    expect(html).toContain('<html lang="zh-CN"');
    expect(html).toContain('rel="canonical" href="https://readfox.app/zh-cn/vocab-test"');
    expect(html).toContain('hrefLang="en" href="https://readfox.app/vocab-test"');
    expect(html).toContain('hrefLang="ja" href="https://readfox.app/ja/vocab-test"');
    expect(html).toContain('hrefLang="x-default" href="https://readfox.app/vocab-test"');

    const jaLanding = await request.get('/ja', {
      headers: { 'accept-language': '' },
    });
    expect(jaLanding.status()).toBe(200);
    const jaHtml = await jaLanding.text();
    expect(jaHtml).toContain('<html lang="ja"');
    expect(jaHtml).toContain('rel="canonical" href="https://readfox.app/ja"');
  });

  test('UiLanguageSelect switches localized public URLs cleanly without auth bounce', async ({
    page,
  }) => {
    await page.goto('/zh-cn/alternatives/lingq');
    await expect(page).toHaveURL(/\/zh-cn\/alternatives\/lingq$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

    await page.getByTestId('ui-language-select').selectOption('en');
    await expect(page).toHaveURL(/\/alternatives\/lingq$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('llms.txt, sitemap.xml, robots.txt, and indexnow-key.txt expose expected contracts', async ({
    request,
  }) => {
    const llms = await (await request.get('/llms.txt')).text();
    expect(llms).toContain('https://readfox.app/alternatives/lingq');
    expect(llms).toContain('https://readfox.app/alternatives/readlang');
    expect(llms).toContain('FSRS');

    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('https://readfox.app/alternatives/lingq');
    expect(sitemap).toContain('https://readfox.app/zh-cn/vocab-test');
    expect(sitemap).toContain('<lastmod>');

    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Sitemap: https://readfox.app/sitemap.xml');

    const keyRes = await request.get('/indexnow-key.txt');
    expect(keyRes.status()).toBe(404);
  });
});
