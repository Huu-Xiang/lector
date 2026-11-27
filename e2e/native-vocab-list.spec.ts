import { expect, test } from '@playwright/test';
import { apiUrl } from './api';

test.use({
  viewport: { width: 393, height: 852 },
  userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ReadfoxApp/1',
});

test('native vocabulary keeps row details, optional selection and empty search usable', async ({
  page,
}) => {
  const id = `native-vocab-${Date.now()}`;
  const word = `nativeword${Date.now()}`;
  const ankiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(':8765')) ankiRequests.push(request.url());
  });
  const created = await page.request.post(apiUrl('/api/vocab'), {
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
  });
  expect(created.ok()).toBeTruthy();
  try {
    await page.goto('/vocab');
    const search = page.getByPlaceholder(/Search words/i);
    await search.fill(word);
    const list = page.getByTestId('native-vocab-list');
    await expect(list.getByRole('button', { name: new RegExp(word) })).toBeVisible();
    await expect(list.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('table')).toBeHidden();
    await expect(page.getByTestId('sync-with-anki')).toBeHidden();
    await expect(page.getByText('Anki Disconnected', { exact: true })).toBeHidden();
    await list.getByRole('button', { name: new RegExp(word) }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByTestId('native-vocab-edit').click();
    const checkbox = list.getByRole('checkbox', { name: word, exact: true });
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    const box = await checkbox.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('button', { name: /Mark.*known/i })).toBeVisible();
    await page.getByTestId('native-vocab-edit').click();
    await expect(list.getByRole('checkbox')).toHaveCount(0);
    await search.fill(`${word}missing`);
    await expect(list.getByRole('button', { name: new RegExp(word) })).toHaveCount(0);
    await expect(list).toContainText(/No entries match/i);
    expect(ankiRequests).toEqual([]);
  } finally {
    await page.request.delete(apiUrl(`/api/vocab/${id}`));
  }
});
