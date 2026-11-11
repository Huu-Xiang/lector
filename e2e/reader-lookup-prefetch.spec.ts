import { test, expect } from '@playwright/test';
import { apiUrl } from './api';

/** A word prefetched when the lesson opens shows its translation on tap with no localize call. */

const TITLE = 'Prefetch Lookup Test';
const SENSES = [{ partOfSpeech: 'noun', gloss: 'prefetched seagull meaning' }];

test.describe('Reader: lookup prefetch', () => {
  let collectionId = '';

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const res = await page.request.get(apiUrl('/api/collections'));
    for (const c of await res.json()) {
      if (c.title === TITLE) await page.request.delete(apiUrl(`/api/collections/${c.id}`));
    }
    await page.request.put(apiUrl('/api/settings/nativeLanguage'), { data: { value: 'zh-CN' } });
  });

  test.afterEach(async ({ page }) => {
    if (collectionId) await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
    collectionId = '';
    await page.request.delete(apiUrl('/api/settings/nativeLanguage'));
  });

  async function openLesson(page: import('@playwright/test').Page) {
    const colRes = await page.request.post(apiUrl('/api/collections'), {
      data: { title: TITLE, language: 'af' },
    });
    collectionId = (await colRes.json()).id;
    await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons`), {
      data: {
        title: 'Hoofstuk 1',
        textContent: 'By die see sien sy n seemeeu wat oor die water vlieg.',
      },
    });
    const lessons = await (
      await page.request.get(apiUrl(`/api/collections/${collectionId}/lessons`))
    ).json();
    await page.goto(`/read/${lessons[0].id}`);
    await expect(page.getByText('seemeeu')).toBeVisible({ timeout: 10000 });
  }

  async function mockLookup(page: import('@playwright/test').Page) {
    await page.route('**/api/dictionary/lookup**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: {
            word: 'seemeeu',
            source: 'dict',
            needsLocalization: true,
            senses: [{ partOfSpeech: 'noun', gloss: 'seagull' }],
          },
        }),
      }),
    );
  }

  test('a tapped prefetched word renders without a localize request', async ({ page }) => {
    const prefetchBodies: Array<{ words: string[] }> = [];
    let localizeCalls = 0;
    await mockLookup(page);
    await page.route('**/api/translate/prefetch', (route) => {
      prefetchBodies.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ senses: { seemeeu: SENSES } }),
      });
    });
    await page.route('**/api/translate/localize', (route) => {
      localizeCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"senses":null}',
      });
    });
    await openLesson(page);
    await expect.poll(() => prefetchBodies.length, { timeout: 10000 }).toBe(1);
    expect(prefetchBodies[0].words).toContain('seemeeu');

    await page
      .locator('article span.cursor-pointer')
      .filter({ hasText: /^seemeeu$/ })
      .first()
      .click();
    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer.getByText('prefetched seagull meaning')).toBeVisible({ timeout: 5000 });
    expect(localizeCalls).toBe(0);
  });

  test('without a prefetched answer the tap falls back to the localize request', async ({
    page,
  }) => {
    let localizeCalls = 0;
    await mockLookup(page);
    await page.route('**/api/translate/prefetch', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"senses":{}}' }),
    );
    await page.route('**/api/translate/localize', (route) => {
      localizeCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ senses: [{ partOfSpeech: 'noun', gloss: 'localized on tap' }] }),
      });
    });
    await openLesson(page);
    await page
      .locator('article span.cursor-pointer')
      .filter({ hasText: /^seemeeu$/ })
      .first()
      .click();
    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer.getByText('localized on tap')).toBeVisible({ timeout: 5000 });
    expect(localizeCalls).toBe(1);
  });
});
