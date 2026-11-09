import { test, expect, Page } from '@playwright/test';
import { apiUrl } from './api';

const COLLECTION_TITLE = 'Auto Save Test';
const LESSON_TEXT = 'Die brulpadda sit by die waterkant. Die sprinkaan spring weg.';
const TEST_WORDS = ['brulpadda', 'sprinkaan'];

async function statesOf(page: Page, text: string): Promise<string[]> {
  const res = await page.request.get(apiUrl('/api/vocab'));
  if (!res.ok()) return [];
  const all = (await res.json()) as Array<{ text: string; state: string }>;
  return all.filter((v) => v.text === text).map((v) => v.state);
}

async function cleanupVocab(page: Page) {
  const res = await page.request.get(apiUrl('/api/vocab'));
  if (!res.ok()) return;
  for (const v of (await res.json()) as Array<{ id: string; text: string }>) {
    if (TEST_WORDS.includes(v.text)) await page.request.delete(apiUrl(`/api/vocab/${v.id}`));
  }
}

async function setAutoSave(page: Page, value: boolean | null) {
  await page.request.put(apiUrl('/api/settings/autoSaveLookups'), { data: { value } });
}

async function openLesson(page: Page): Promise<string> {
  const colRes = await page.request.post(apiUrl('/api/collections'), {
    data: { title: COLLECTION_TITLE, language: 'af' },
  });
  const { id: collectionId } = await colRes.json();
  await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons`), {
    data: { title: 'Hoofstuk 1', textContent: LESSON_TEXT },
  });
  const lessons = await (
    await page.request.get(apiUrl(`/api/collections/${collectionId}/lessons`))
  ).json();
  await page.goto(`/read/${lessons[0].id}`);
  await page.waitForLoadState('networkidle');
  await expect(readerWord(page, 'brulpadda')).toBeVisible({ timeout: 10000 });
  return collectionId;
}

function readerWord(page: Page, word: string) {
  return page.locator('article span.cursor-pointer', { hasText: word }).first();
}

async function lookUp(page: Page, word: string) {
  await readerWord(page, word).click();
  const drawer = page.getByTestId('translation-drawer');
  await expect(drawer).toHaveClass(/translate-x-0/, { timeout: 5000 });
  await expect(drawer.getByText(`[gloss: ${word}]`).first()).toBeVisible({ timeout: 5000 });
}

test.describe('Auto-save of looked-up words', () => {
  let collectionId: string;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route('**/api/translate/gloss', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: `[gloss: ${body.word}]`,
      });
    });
    const res = await page.request.get(apiUrl('/api/collections'));
    for (const c of await res.json()) {
      if (c.title === COLLECTION_TITLE) {
        await page.request.delete(apiUrl(`/api/collections/${c.id}`));
      }
    }
    await cleanupVocab(page);
  });

  test.afterEach(async ({ page }) => {
    await setAutoSave(page, null);
    if (collectionId) await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
    await cleanupVocab(page);
  });

  test('a looked-up word is saved once at level 1', async ({ page }) => {
    collectionId = await openLesson(page);
    await lookUp(page, 'brulpadda');

    await expect.poll(() => statesOf(page, 'brulpadda')).toEqual(['level1']);

    await page.keyboard.press('Escape');
    await lookUp(page, 'brulpadda');
    await page.waitForLoadState('networkidle');
    expect(await statesOf(page, 'brulpadda')).toEqual(['level1']);
  });

  test('a failed save stays silent and leaves no saved word', async ({ page }) => {
    await page.route('**/api/vocab', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 500, body: '{}' });
      } else {
        await route.continue();
      }
    });
    collectionId = await openLesson(page);
    await lookUp(page, 'brulpadda');

    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    expect(await statesOf(page, 'brulpadda')).toEqual([]);
  });

  test('turning the setting off stops the save', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('auto-save-lookups-off').click();
    await expect(page.getByTestId('auto-save-lookups-off')).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await page.request.get(apiUrl('/api/settings/autoSaveLookups'))).json())
      .toBe(false);

    collectionId = await openLesson(page);
    await lookUp(page, 'sprinkaan');

    await page.waitForLoadState('networkidle');
    expect(await statesOf(page, 'sprinkaan')).toEqual([]);
  });
});
