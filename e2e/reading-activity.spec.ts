import { test, expect, Page } from '@playwright/test';
import { apiUrl } from './api';

const COLLECTION_TITLE = 'Reading Activity Test';
const PARAGRAPH = 'Die brulpadda sit by die waterkant en die sprinkaan spring weg oor die gras. ';
const LESSON_TEXT = Array.from({ length: 80 }, () => PARAGRAPH.repeat(4).trim()).join('\n\n');

async function wordsReadToday(page: Page): Promise<number> {
  const res = await page.request.get(apiUrl('/api/stats/today'));
  return ((await res.json()) as { wordsRead: number }).wordsRead;
}

async function scrollReaderTo(page: Page, fraction: number) {
  await page
    .locator('article')
    .first()
    .evaluate((article, f) => {
      let el: HTMLElement | null = article as HTMLElement;
      while (el && el.scrollHeight <= el.clientHeight + 1) el = el.parentElement;
      if (!el) throw new Error('no scrollable reader container');
      el.scrollTop = (el.scrollHeight - el.clientHeight) * f;
    }, fraction);
}

test.describe('Reading activity', () => {
  let collectionId: string;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const res = await page.request.get(apiUrl('/api/collections'));
    for (const c of await res.json()) {
      if (c.title === COLLECTION_TITLE) {
        await page.request.delete(apiUrl(`/api/collections/${c.id}`));
      }
    }
  });

  test.afterEach(async ({ page }) => {
    if (collectionId) await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
  });

  test('scrolling a lesson and leaving it adds the words read to the daily stats', async ({
    page,
  }) => {
    const colRes = await page.request.post(apiUrl('/api/collections'), {
      data: { title: COLLECTION_TITLE, language: 'af' },
    });
    collectionId = (await colRes.json()).id;
    await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons`), {
      data: { title: 'Hoofstuk 1', textContent: LESSON_TEXT },
    });
    const lessons = await (
      await page.request.get(apiUrl(`/api/collections/${collectionId}/lessons`))
    ).json();

    const before = await wordsReadToday(page);
    await page.goto(`/read/${lessons[0].id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('article span.cursor-pointer').first()).toBeVisible({
      timeout: 10000,
    });

    // The first scroll report sets the baseline; the second one counts.
    await scrollReaderTo(page, 0.05);
    await page.waitForTimeout(200);
    await scrollReaderTo(page, 1);

    // Leaving the lesson sends what was read since the last 30 s tick.
    await page.locator('a[href="/stats"]:visible').first().click();
    await expect(page).toHaveURL(/\/stats/);

    await expect.poll(() => wordsReadToday(page), { timeout: 10000 }).toBeGreaterThan(before);
  });
});
