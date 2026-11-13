import { test, expect, Page } from '@playwright/test';
import { apiUrl } from './api';

const COLLECTION_TITLE = 'Auto Save Test';
const LESSON_TEXT =
  'Die flipgrobbel sit by die waterkant. Die zinkfloep spring weg. Nou slaap flipgrobbel.';
// Not in the pinned af dictionary, so the AI gloss mock answers.
const TEST_WORDS = ['flipgrobbel', 'zinkfloep'];

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

async function resetAutoSave(page: Page) {
  await page.request.delete(apiUrl('/api/settings/autoSaveLookups'));
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
  await expect(readerWord(page, 'flipgrobbel')).toBeVisible({ timeout: 10000 });
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
    await resetAutoSave(page);
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
    await resetAutoSave(page);
    if (collectionId) await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
    await cleanupVocab(page);
  });

  test('looks up without saving by default and supports mobile save and undo', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    collectionId = await openLesson(page);
    const drawer = page.getByTestId('translation-drawer');
    const close = drawer.getByRole('button', { name: 'Close', exact: true });
    const first = readerWord(page, 'flipgrobbel');
    const next = page.locator('article span.cursor-pointer', { hasText: 'flipgrobbel' }).last();
    await first.click();
    await expect(drawer.getByTestId('save-looked-up-word')).toBeVisible();
    expect(await statesOf(page, 'flipgrobbel')).toEqual([]);
    await close.click();
    await first.click();
    await expect(drawer.getByTestId('save-looked-up-word')).toBeVisible();
    await expect(drawer.getByTestId('repeat-lookup-hint')).toHaveCount(0);
    await close.click();
    await next.click();
    await expect(drawer.getByTestId('repeat-lookup-hint')).toBeVisible();
    await drawer.getByTestId('save-looked-up-word').click();
    await expect(drawer.getByTestId('undo-lookup-save')).toBeVisible();
    expect(await statesOf(page, 'flipgrobbel')).toEqual(['level1']);
    await drawer.getByTestId('undo-lookup-save').click();
    await expect(drawer.getByTestId('save-looked-up-word')).toBeVisible();
    expect(await statesOf(page, 'flipgrobbel')).toEqual([]);
    await close.click();
    await first.click();
    await expect(drawer.getByTestId('save-looked-up-word')).toBeVisible();
    await expect(drawer.getByTestId('repeat-lookup-hint')).toHaveCount(0);
  });

  test('keeps the definition on context error and shows one result after retry', async ({
    page,
  }) => {
    let calls = 0;
    await page.route('**/api/translate', async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({
        explainContext: true,
        word: 'flipgrobbel',
        sentence: expect.stringContaining('waterkant'),
      });
      calls++;
      await route.fulfill(
        calls === 1
          ? { status: 502, json: { error: 'provider error' } }
          : { json: { translation: 'Here it describes the creature sitting by the water.' } },
      );
    });
    collectionId = await openLesson(page);
    await lookUp(page, 'flipgrobbel');
    const drawer = page.getByTestId('translation-drawer');
    const request = drawer.getByTestId('request-word-context');
    await request.click();
    await expect(request).toHaveText('Retry context explanation');
    await expect(drawer.getByText('[gloss: flipgrobbel]').first()).toBeVisible();
    await request.click();
    const result = drawer.getByTestId('word-context-result');
    await expect(result).toContainText('Here it describes the creature sitting by the water.');
    await expect(result.locator('mark')).toHaveText('flipgrobbel');
    await expect(request).toHaveCount(0);
    await expect(drawer.getByTestId('save-looked-up-word')).toBeVisible();
  });

  test('a looked-up word is saved once at level 1', async ({ page }) => {
    await page.request.put(apiUrl('/api/settings/autoSaveLookups'), { data: { value: true } });
    collectionId = await openLesson(page);
    await lookUp(page, 'flipgrobbel');

    await expect.poll(() => statesOf(page, 'flipgrobbel')).toEqual(['level1']);

    await page.keyboard.press('Escape');
    await lookUp(page, 'flipgrobbel');
    await page.waitForLoadState('networkidle');
    expect(await statesOf(page, 'flipgrobbel')).toEqual(['level1']);
  });

  for (const status of [500, 429]) {
    test(`a save that fails with ${status} stays silent and leaves no saved word`, async ({
      page,
    }) => {
      await page.request.put(apiUrl('/api/settings/autoSaveLookups'), { data: { value: true } });
      await page.route('**/api/vocab', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(
              status === 429 ? { error: 'Plan limit reached', code: 'plan_limit' } : {},
            ),
          });
        } else {
          await route.continue();
        }
      });
      collectionId = await openLesson(page);
      await lookUp(page, 'flipgrobbel');

      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
      expect(await statesOf(page, 'flipgrobbel')).toEqual([]);
    });
  }

  test('a failed read of the setting does not turn auto-save on for a user who turned it off', async ({
    page,
  }) => {
    await page.request.put(apiUrl('/api/settings/autoSaveLookups'), { data: { value: false } });
    await page.route('**/api/settings/autoSaveLookups', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 500, body: '{}' })
        : route.continue(),
    );
    collectionId = await openLesson(page);
    await lookUp(page, 'flipgrobbel');

    await page.waitForLoadState('networkidle');
    expect(await statesOf(page, 'flipgrobbel')).toEqual([]);
  });

  test('turning the setting off stops the save', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('auto-save-lookups-off').click();
    await expect(page.getByTestId('auto-save-lookups-off')).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await page.request.get(apiUrl('/api/settings/autoSaveLookups'))).json())
      .toBe(false);

    collectionId = await openLesson(page);
    await lookUp(page, 'zinkfloep');

    await page.waitForLoadState('networkidle');
    expect(await statesOf(page, 'zinkfloep')).toEqual([]);
  });
});
