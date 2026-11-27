import { expect, test as base } from '@playwright/test';
import { apiUrl } from './api';

const test = base.extend<{ nativeVocab: { word: string; removed: boolean } }>({
  nativeVocab: async ({ request }, provide) => {
    const id = `native-vocab-${Date.now()}`;
    const word = `nativeword${Date.now()}`;
    const created = await request.post(apiUrl('/api/vocab'), {
      data: {
        id,
        text: word,
        type: 'word',
        sentence: `A sentence with ${word}.`,
        translation: 'A native list translation',
        state: 'level1',
        stateUpdatedAt: new Date().toISOString(),
        reviewCount: 0,
        createdAt: new Date().toISOString(),
        pushedToAnki: false,
        language: 'af',
      },
      timeout: 5000,
    });
    expect(created.ok()).toBeTruthy();
    const nativeVocab = { word, removed: false };
    try {
      await provide(nativeVocab);
    } finally {
      if (!nativeVocab.removed) {
        const deleted = await request.delete(apiUrl(`/api/vocab/${id}`), { timeout: 5000 });
        expect(deleted.ok()).toBeTruthy();
      }
    }
  },
});

test.use({
  viewport: { width: 393, height: 852 },
  userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ReadfoxApp/1',
});

test.describe('narrow iPad vocabulary', () => {
  test.use({
    viewport: { width: 500, height: 852 },
    userAgent: 'Mozilla/5.0 (iPad) AppleWebKit/605.1.15 ReadfoxApp/1',
  });

  test('keeps the existing search and state select', async ({ page }) => {
    await page.goto('/vocab');
    await expect(page.locator('html')).toHaveAttribute('data-ipad-app', '');
    await expect(page.getByTestId('native-vocab-filters')).toHaveCount(0);
    const search = page.getByTestId('vocab-search-input');
    await expect(search).toHaveAttribute(
      'placeholder',
      'Search words, translations, or sentences...',
    );
    await search.fill('ipad-search');
    await expect(page.getByTestId('native-vocab-clear')).toHaveCount(0);
    await expect(
      page
        .getByRole('combobox')
        .filter({ has: page.getByRole('option', { name: 'All', exact: true }) }),
    ).toBeVisible();
  });
});

test('native vocabulary keeps row details, optional selection and empty search usable', async ({
  page,
  nativeVocab,
}) => {
  const { word } = nativeVocab;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const ankiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(':8765')) ankiRequests.push(request.url());
  });
  await page.goto('/vocab');
  const search = page.getByPlaceholder(/Search words/i);
  await search.fill(word);
  const list = page.getByTestId('native-vocab-list');
  await expect(list.getByRole('button', { name: new RegExp(word) })).toBeVisible();
  await expect(list.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('table')).toBeHidden();
  await expect(page.getByTestId('sync-with-anki')).toBeHidden();
  await expect(page.getByText('Anki Disconnected', { exact: true })).toBeHidden();
  const resultsBar = page.getByTestId('vocab-results-bar');
  const editButton = page.getByTestId('native-vocab-edit');
  const countBox = await resultsBar.locator(':scope > span').boundingBox();
  const editBox = await editButton.boundingBox();
  expect(countBox).not.toBeNull();
  expect(editBox).not.toBeNull();
  expect(
    Math.abs(countBox!.y + countBox!.height / 2 - editBox!.y - editBox!.height / 2),
  ).toBeLessThan(2);
  const collections = page
    .getByRole('combobox')
    .filter({ has: page.getByRole('option', { name: 'All Collections', exact: true }) });
  const collectionBox = await collections.boundingBox();
  expect(collectionBox).not.toBeNull();
  expect(collectionBox!.x).toBe(16);
  expect(collectionBox!.x + collectionBox!.width).toBe(377);
  await list.getByRole('button', { name: new RegExp(word) }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByTestId('native-vocab-edit').click();
  const checkbox = list.getByRole('checkbox', { name: word, exact: true });
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  for (const target of [checkbox, resultsBar.getByRole('checkbox')]) {
    const box = await target.locator('..').boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    const inputBox = await target.boundingBox();
    expect(inputBox?.width).toBe(20);
    expect(inputBox?.height).toBe(20);
  }
  await expect(page.getByRole('button', { name: /Mark.*known/i })).toBeVisible();
  await page.getByTestId('native-vocab-edit').click();
  await expect(list.getByRole('checkbox')).toHaveCount(0);
  await search.fill(`${word}missing`);
  await expect(list.getByRole('button', { name: new RegExp(word) })).toHaveCount(0);
  await expect(list).toContainText(/No entries match/i);
  await page.getByTestId('native-vocab-clear').click();
  await expect(search).toHaveValue('');
  await expect(page.getByTestId('native-vocab-clear')).toBeHidden();
  await search.fill(word);
  const filters = page.getByTestId('native-vocab-filters');
  await filters.getByRole('button', { name: 'Known', exact: true }).click();
  await expect(filters.getByRole('button', { name: 'Known', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(list.getByRole('button', { name: new RegExp(word) })).toHaveCount(0);
  await filters.getByRole('button', { name: 'Learning', exact: true }).click();
  const row = list.locator('[data-native-vocab-row]').filter({ hasText: word });
  await expect(row).toHaveCSS('touch-action', 'pan-y');
  const swipe = async (deltaX: number, deltaY = 0, waitForClosed = true) => {
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeInViewport();
    if (waitForClosed) {
      await expect(row.locator('.native-vocab-swipe-content')).toHaveCSS(
        'transform',
        /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/,
      );
    }
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + box!.width - 30;
    const startY = box!.y + box!.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 });
    await page.mouse.up();
  };
  await swipe(-12, 120);
  await expect(row).toHaveAttribute('data-swipe-open', 'false');
  await expect(page.getByRole('dialog')).toBeHidden();
  await swipe(-180);
  await expect(row).toHaveAttribute('data-swipe-open', 'true');
  await expect(page.getByRole('dialog')).toBeHidden();
  const closingSurfaceIsSwipeable = await row.evaluate(async (element) => {
    const closed = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (element.getAttribute('data-swipe-open') === 'false') {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(element, { attributes: true, attributeFilter: ['data-swipe-open'] });
    });
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await closed;
    const foreground = element.querySelector('.native-vocab-swipe-content')!;
    const closing = foreground.getAnimations()[0];
    if (!closing) throw new Error('Expected the row closing transition');
    closing.pause();
    closing.currentTime = 0;
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.right - 30, box.y + box.height / 2) === element;
  });
  expect(closingSurfaceIsSwipeable).toBe(true);
  await expect(row).toHaveAttribute('data-swipe-open', 'false');
  await swipe(-180, 0, false);
  await expect(row).toHaveAttribute('data-swipe-open', 'true');
  await expect(row.getByTestId('native-vocab-known')).toBeInViewport();
  await row.getByTestId('native-vocab-known').click();
  await expect(row).toHaveCount(0);
  await filters.getByRole('button', { name: 'Known', exact: true }).click();
  await expect(row).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await swipe(-180);
  await expect(row).toHaveAttribute('data-swipe-open', 'true');
  await expect(row.locator('.native-vocab-swipe-content')).toHaveCSS('transform', 'none');
  await expect(row.locator('.native-vocab-swipe-content')).toHaveCSS('left', '-152px');
  const confirmation = page.waitForEvent('dialog');
  const deleteClick = row.getByTestId('native-vocab-delete').click();
  const dialog = await confirmation;
  expect(dialog.type()).toBe('confirm');
  await dialog.accept();
  await deleteClick;
  await expect(row).toHaveCount(0);
  nativeVocab.removed = true;
  expect(ankiRequests).toEqual([]);
});
