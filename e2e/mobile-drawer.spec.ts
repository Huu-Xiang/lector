import { test, expect, Page } from '@playwright/test';
import { apiUrl } from './api';

const TITLE = 'Sheet Test';
const LONG_TEXT = Array.from(
  { length: 12 },
  (_, n) =>
    `Paragraaf ${n + 1}. Die Perdekraal-fees is baie gewild. Ons gaan na die Klein-Karoo toe.`,
).join('\n\n');

async function openLesson(page: Page): Promise<string> {
  const colRes = await page.request.post(apiUrl('/api/collections'), {
    data: { title: TITLE, language: 'af' },
  });
  const { id: collectionId } = await colRes.json();
  await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons`), {
    data: { title: 'Hoofstuk 1', textContent: LONG_TEXT },
  });
  const lessons = await (
    await page.request.get(apiUrl(`/api/collections/${collectionId}/lessons`))
  ).json();
  await page.goto(`/read/${lessons[0].id}`);
  await page.waitForLoadState('networkidle');
  return collectionId;
}

test.describe('Word drawer on small screens', () => {
  let collectionId: string | undefined;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/translate/gloss', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: `[translated: ${body.word}]`,
      });
    });
    const res = await page.request.get(apiUrl('/api/collections'));
    for (const c of await res.json()) {
      if (c.title === TITLE) await page.request.delete(apiUrl(`/api/collections/${c.id}`));
    }
  });

  test.afterEach(async ({ page }) => {
    if (collectionId) await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
    collectionId = undefined;
  });

  for (const [name, size] of [
    ['phone', { width: 390, height: 844 }],
    ['tablet portrait', { width: 820, height: 1180 }],
  ] as const) {
    test(`${name}: the drawer is a bottom sheet and the tapped word stays visible`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      collectionId = await openLesson(page);

      const word = page.getByRole('button', { name: 'Look up Perdekraal-fees' }).last();
      await word.scrollIntoViewIfNeeded();
      await word.click();

      const drawer = page.getByTestId('translation-drawer');
      await expect(drawer).toHaveClass(/(^|\s)translate-y-0(\s|$)/, { timeout: 5000 });
      await expect(drawer.getByRole('heading', { name: 'Perdekraal-fees' })).toBeVisible();

      await expect
        .poll(async () => {
          const settled = await drawer.boundingBox();
          return settled ? Math.round(settled.y + settled.height) : null;
        })
        .toBe(size.height);
      const box = await drawer.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeCloseTo(size.width, 0);
      expect(box!.height).toBeLessThan(size.height * 0.6);

      await expect(page.locator('[data-active-word]').first()).toBeVisible();
      await expect
        .poll(async () => {
          const wordBox = await page.locator('[data-active-word]').first().boundingBox();
          return wordBox ? wordBox.y + wordBox.height <= box!.y : false;
        })
        .toBe(true);

      await expect(page.getByTestId('translation-drawer-handle')).toBeVisible();
    });
  }

  test('phone: the close button hides the sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    collectionId = await openLesson(page);
    await page.getByRole('button', { name: 'Look up Perdekraal-fees' }).first().click();
    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer).toHaveClass(/(^|\s)translate-y-0(\s|$)/, { timeout: 5000 });

    await drawer.getByRole('button', { name: /close/i }).click();
    await expect(drawer).toHaveClass(/translate-y-full/);
  });

  test('phone: dragging the handle resizes the sheet and the height is remembered', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    collectionId = await openLesson(page);
    await page.getByRole('button', { name: 'Look up Perdekraal-fees' }).first().click();
    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer).toHaveClass(/(^|\s)translate-y-0(\s|$)/, { timeout: 5000 });

    await expect
      .poll(async () => {
        const settled = await drawer.boundingBox();
        return settled ? Math.round(settled.y + settled.height) : null;
      })
      .toBe(844);
    const handle = page.getByTestId('translation-drawer-handle');
    const before = await drawer.boundingBox();
    const grip = (await handle.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, 300, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () => (await drawer.boundingBox())!.height)
      .toBeGreaterThan(before!.height + 100);
    await expect(drawer).toHaveClass(/(^|\s)translate-y-0(\s|$)/);
    const resized = (await drawer.boundingBox())!.height;

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Look up Perdekraal-fees' }).first().click();
    await expect(drawer).toHaveClass(/(^|\s)translate-y-0(\s|$)/, { timeout: 5000 });
    await expect.poll(async () => (await drawer.boundingBox())!.height).toBeCloseTo(resized, -1);
  });

  test('phone: dragging the handle far down closes the sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    collectionId = await openLesson(page);
    await page.getByRole('button', { name: 'Look up Perdekraal-fees' }).first().click();
    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer).toHaveClass(/(^|\s)translate-y-0(\s|$)/, { timeout: 5000 });

    await expect
      .poll(async () => {
        const settled = await drawer.boundingBox();
        return settled ? Math.round(settled.y + settled.height) : null;
      })
      .toBe(844);
    const grip = (await page.getByTestId('translation-drawer-handle').boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, 835, { steps: 8 });
    await page.mouse.up();
    await expect(drawer).toHaveClass(/translate-y-full/);
  });

  test('desktop: the drawer stays a side panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    collectionId = await openLesson(page);
    await page.getByRole('button', { name: 'Look up Perdekraal-fees' }).first().click();
    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer).toHaveClass(/(^|\s)lg:translate-x-0(\s|$)/, { timeout: 5000 });

    const box = await drawer.boundingBox();
    expect(box!.width).toBeCloseTo(384, 0);
    expect(box!.height).toBeCloseTo(800, 0);
    await expect(page.getByTestId('translation-drawer-handle')).toBeHidden();
  });
});

test.describe('iOS lookup sheet', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 ReadfoxApp/1',
  });

  test('keeps definitions above a compact footer and reveals word actions on demand', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/dictionary/lookup?*', (route) =>
      route.fulfill({
        json: {
          entry: {
            word: 'Perdekraal-fees',
            rank: 1200,
            senses: [{ partOfSpeech: 'noun', gloss: 'A festival.' }],
          },
        },
      }),
    );
    await page.request.put(apiUrl('/api/settings/autoSaveLookups'), { data: { value: false } });
    await page.route('**/api/translate', (route) =>
      route.fulfill({ json: { translation: 'The festival held in Perdekraal.' } }),
    );
    const collectionId = await openLesson(page);
    try {
      await page.getByRole('button', { name: 'Look up Perdekraal-fees' }).first().click();
      const drawer = page.getByTestId('translation-drawer');
      const more = drawer.getByTestId('native-lookup-actions');
      const handle = drawer.getByTestId('translation-drawer-handle');
      const save = drawer.getByTestId('save-looked-up-word');
      await expect(save).toBeVisible();
      await expect(drawer.getByText(/A festival\./).first()).toBeInViewport();
      await expect(drawer.getByTestId('lookup-original-sentence')).toBeInViewport();
      await expect(drawer.getByTestId('entry-badges')).toBeHidden();
      await expect(drawer.getByTestId('word-level-1')).toHaveCount(0);

      const dictionaryDetails = drawer.getByText('Dictionary details', { exact: true });
      await dictionaryDetails.click();
      await expect(drawer.getByTestId('entry-badges')).toBeVisible();
      await dictionaryDetails.click();

      await more.click();
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      await expect(drawer.getByTestId('word-level-1')).toBeVisible();
      await more.click();
      await expect(drawer.getByText(/A festival\./).first()).toBeInViewport();

      const context = drawer.getByTestId('request-word-context');
      await expect(context).toBeVisible();
      const heading = (await drawer
        .getByRole('heading', { name: 'Perdekraal-fees' })
        .boundingBox())!;
      expect(Math.abs((await context.boundingBox())!.y - heading.y)).toBeLessThan(24);
      await context.click();
      await page.getByTestId('ai-notice-agree').click();
      await expect(page.getByTestId('ai-notice')).toBeHidden();
      await expect(drawer.getByTestId('word-context-result')).toContainText(
        'The festival held in Perdekraal.',
      );

      const initial = (await drawer.boundingBox())!.height;
      expect(initial).toBeCloseTo(667 * 0.34, -1);
      async function drag(distance: number) {
        await expect(handle).toBeInViewport();
        const grip = (await handle.boundingBox())!;
        const x = grip.x + grip.width / 2;
        const y = grip.y + grip.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x, y + distance, { steps: 6 });
        await page.mouse.up();
      }

      await drag(-100);
      await expect
        .poll(async () => Math.round((await drawer.boundingBox())!.height - initial))
        .toBe(100);
      await drag(55);
      await expect
        .poll(async () => Math.round((await drawer.boundingBox())!.height - initial))
        .toBe(45);
      await handle.press('Enter');
      await expect
        .poll(async () => Math.round((await drawer.boundingBox())!.height))
        .toBe(Math.round(initial));
      await handle.press('Enter');
      await expect.poll(async () => (await drawer.boundingBox())!.height).toBeGreaterThan(500);
    } finally {
      await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
      await page.request.delete(apiUrl('/api/settings/autoSaveLookups'));
      await page.request.delete(apiUrl('/api/settings/aiNoticeAcceptedAt'));
    }
  });
});

test.describe('iPad reader', () => {
  test.use({
    viewport: { width: 1180, height: 820 },
    userAgent: 'Mozilla/5.0 (iPad) AppleWebKit/605.1.15 Mobile/15E148 ReadfoxApp/1',
  });

  test('keeps the active lookup when the reader switches from a side panel to a sheet', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/dictionary/lookup?*', (route) =>
      route.fulfill({
        json: {
          entry: {
            word: 'Perdekraal-fees',
            senses: [{ partOfSpeech: 'noun', gloss: 'A festival.' }],
          },
        },
      }),
    );
    const collectionId = await openLesson(page);
    try {
      const sidebar = page.locator('.app-sidebar');
      await expect(sidebar).toBeHidden();
      await page.getByRole('button', { name: 'Look up Perdekraal-fees' }).first().click();

      const drawer = page.getByTestId('translation-drawer');
      const heading = drawer.getByRole('heading', { name: 'Perdekraal-fees' });
      await expect(drawer).toHaveAttribute('data-native-side-drawer', 'true');
      await expect(heading).toBeInViewport();
      await expect(drawer.getByTestId('lookup-original-sentence')).toBeInViewport();
      await expect(drawer.getByTestId('native-lookup-actions')).toBeVisible();
      await expect(drawer.getByTestId('translation-drawer-handle')).toBeHidden();

      await page.setViewportSize({ width: 820, height: 1180 });
      await expect(drawer).toHaveAttribute('data-native-sheet', 'true');
      await expect(heading).toBeInViewport();
      const handle = drawer.getByTestId('translation-drawer-handle');
      await expect(handle).toBeVisible();
      await handle.click();
      await expect(handle).toHaveAttribute('aria-expanded', 'true');

      await page.setViewportSize({ width: 1180, height: 820 });
      await expect(handle).toBeHidden();
      await page.setViewportSize({ width: 820, height: 1180 });
      await expect(handle).toHaveAttribute('aria-expanded', 'false');
      await expect(heading).toBeInViewport();

      await page.setViewportSize({ width: 440, height: 820 });
      await expect(heading).toBeInViewport();
      await drawer.getByRole('button', { name: /close/i }).click();
      await expect(drawer).toHaveAttribute('aria-hidden', 'true');

      await page.setViewportSize({ width: 1180, height: 820 });
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(sidebar).toBeHidden();
    } finally {
      await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
    }
  });
});
