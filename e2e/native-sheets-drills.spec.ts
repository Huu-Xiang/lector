import { expect, test, type Locator } from '@playwright/test';
import { apiUrl } from './api';

test.use({
  viewport: { width: 393, height: 852 },
  userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ReadfoxApp/1',
});

async function expectSheet(sheet: Locator) {
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-slot="dialog-grabber"]')).toBeVisible();
  await expect(sheet).toHaveCSS('border-bottom-left-radius', '0px');
  await expect
    .poll(async () => {
      const box = (await sheet.boundingBox())!;
      return Math.abs(box.y + box.height - 852);
    })
    .toBeLessThan(1);
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(393);
  expect(box.height).toBeLessThanOrEqual(852 * 0.9 + 1);
}

test('Import preserves destinations and opens the audio chooser from a bottom sheet', async ({
  page,
}) => {
  const created = await page.request.post(apiUrl('/api/groups'), {
    data: { name: `Native sheet ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const { id } = await created.json();
  try {
    await page.goto('/');
    await page.getByTestId('library-import').click();
    const sheet = page.getByTestId('native-import-sheet');
    await expectSheet(sheet);
    const destination = sheet.getByTestId(`import-destination-${id}`);
    await destination.click();
    await expect(destination).toHaveAttribute('aria-pressed', 'true');
    const chooser = page.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: 'Import Audio', exact: true }).click();
    await (await chooser).setFiles([]);
    await expect(sheet).toHaveCount(0);
    await page.getByTestId('library-import').click();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  } finally {
    await page.request.delete(apiUrl(`/api/groups/${id}`));
  }
});

test('Free books inherits the sheet and Reader Display keeps native menu roles and keyboard movement', async ({
  page,
}) => {
  const previousAutoPronounce = await (
    await page.request.get(apiUrl('/api/settings/autoPronounceOnLookup'))
  ).json();
  const previousNativeLanguage = await (
    await page.request.get(apiUrl('/api/settings/nativeLanguage'))
  ).json();
  const previousTargetLanguage = await (
    await page.request.get(apiUrl('/api/settings/targetLanguage'))
  ).json();
  let id: string | undefined;
  try {
    await page.request.put(apiUrl('/api/settings/autoPronounceOnLookup'), {
      data: { value: false },
    });
    await page.request.put(apiUrl('/api/settings/nativeLanguage'), { data: { value: 'fr' } });
    await page.request.put(apiUrl('/api/settings/targetLanguage'), { data: { value: 'en' } });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.setItem('lector-target-language', 'en'));
    await page.reload();
    await page.getByTestId('free-books-btn').click();
    const booksSheet = page.getByRole('dialog');
    await expectSheet(booksSheet);
    const tabs = booksSheet.getByTestId('free-books-tabs');
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole('button')).toHaveCount(4);
    const tabsBox = (await tabs.boundingBox())!;
    const sheetBox = (await booksSheet.boundingBox())!;
    expect(tabsBox.height).toBeGreaterThanOrEqual(44);
    expect(tabsBox.y).toBeGreaterThanOrEqual(sheetBox.y);
    expect(tabsBox.y + tabsBox.height).toBeLessThanOrEqual(sheetBox.y + sheetBox.height);
    for (const tab of await tabs.getByRole('button').all()) {
      await expect(tab).toBeVisible();
      const box = (await tab.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThanOrEqual(tabsBox.y);
      expect(box.y + box.height).toBeLessThanOrEqual(tabsBox.y + tabsBox.height);
      expect(box.x).toBeGreaterThanOrEqual(sheetBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width);
      await expect(tab).toBeInViewport({ ratio: 1 });
    }
    await page.keyboard.press('Escape');
    await page.request.put(apiUrl('/api/settings/targetLanguage'), { data: { value: 'af' } });
    await page.evaluate(() => localStorage.setItem('lector-target-language', 'af'));
    const collection = await page.request.post(apiUrl('/api/collections'), {
      data: { title: 'Native display sheet', language: 'af' },
    });
    expect(collection.ok()).toBeTruthy();
    ({ id } = await collection.json());
    expect(
      (
        await page.request.post(apiUrl(`/api/collections/${id}/lessons`), {
          data: { title: 'Chapter', textContent: 'Die son skyn.' },
        })
      ).ok(),
    ).toBeTruthy();
    const lessons = await (await page.request.get(apiUrl(`/api/collections/${id}/lessons`))).json();
    await page.goto(`/read/${lessons[0].id}`);
    await page.getByTestId('reader-display-menu-btn').click();
    await expectSheet(page.getByRole('dialog'));
    const menu = page.getByTestId('reader-display-menu');
    await expect(menu.getByTestId('toggle-auto-pronounce')).toContainText(
      'Auto-pronounce on word tap',
    );
    const edit = menu.getByTestId('native-edit-text-menu-item');
    await expect(edit).toHaveAttribute('role', 'menuitem');
    await edit.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitemradio').first()).toBeFocused();
    await menu.getByTestId('toggle-auto-pronounce').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByTestId('reader-display-menu-btn').click();
    await expect(menu.getByTestId('toggle-auto-pronounce')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
  } finally {
    if (id) await page.request.delete(apiUrl(`/api/collections/${id}`));
    for (const [key, value] of [
      ['targetLanguage', previousTargetLanguage],
      ['nativeLanguage', previousNativeLanguage],
    ] as const) {
      if (value === null) await page.request.delete(apiUrl(`/api/settings/${key}`));
      else await page.request.put(apiUrl(`/api/settings/${key}`), { data: { value } });
    }
    if (previousAutoPronounce === null)
      await page.request.delete(apiUrl('/api/settings/autoPronounceOnLookup'));
    else
      await page.request.put(apiUrl('/api/settings/autoPronounceOnLookup'), {
        data: { value: previousAutoPronounce },
      });
  }
});

test('active and empty Fill-in rounds use one native exit and hide shortcut chrome', async ({
  page,
}) => {
  await page.goto('/practice');
  await page.getByRole('button', { name: 'Fill in', exact: true }).click();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByTestId('cloze-word').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeVisible();
  await expect(page.getByTestId('native-back')).toBeVisible();
  await expect(page.locator('.native-drill-back:visible')).toHaveCount(0);
  await expect(page.locator('kbd:visible')).toHaveCount(0);
  const input = page.locator('.native-cloze-input');
  await input.focus();
  await expect(input).toHaveCSS('box-shadow', 'none');
  await expect(page.locator('.native-practice-check')).toHaveCSS('min-height', '48px');
  await page.getByTestId('native-back').click();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await page.route('**/api/cloze/due?*', (route) => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No New Sentences', exact: true })).toBeVisible();
  await expect(page.locator('.native-drill-back:visible')).toHaveCount(0);
  await page.getByTestId('native-back').click();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
});

test('word review fills the phone and exits through the native toolbar', async ({ page }) => {
  const id = `native-review-${Date.now()}`;
  expect(
    (
      await page.request.post(apiUrl('/api/vocab'), {
        data: {
          id,
          text: id,
          type: 'word',
          language: 'af',
          state: 'level1',
          translation: 'garden',
          sentence: 'Die tuin is groen.',
        },
      })
    ).ok(),
  ).toBeTruthy();
  try {
    await page.goto('/practice');
    await page.getByTestId('word-review-open').click();
    await expect(page.getByTestId('word-review-round')).toBeVisible();
    expect((await page.locator('.native-word-review').boundingBox())!.width).toBe(393);
    await expect(page.locator('.native-drill-back:visible')).toHaveCount(0);
    await expect(page.locator('kbd:visible')).toHaveCount(0);
    await page.getByTestId('native-back').click();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  } finally {
    await page.request.delete(apiUrl(`/api/vocab/${id}`));
  }
});

for (const device of [
  { name: 'desktop', viewport: { width: 1024, height: 852 }, userAgent: 'Mozilla/5.0' },
  {
    name: 'narrow iPad',
    viewport: { width: 500, height: 852 },
    userAgent: 'Mozilla/5.0 (iPad) AppleWebKit/605.1.15 ReadfoxApp/1',
  },
]) {
  test.describe(device.name, () => {
    test.use({ viewport: device.viewport, userAgent: device.userAgent });
    test('retains centered dialogs and inline Import options', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('library-import').click();
      await expect(page.getByTestId('native-import-sheet')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Import Audio', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByTestId('free-books-btn').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('[data-slot="dialog-grabber"]')).toBeHidden();
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThan(0);
      expect(box.y + box.height).toBeLessThan(852);
      await expect(dialog).not.toHaveCSS('border-bottom-left-radius', '0px');
    });
  });
}
