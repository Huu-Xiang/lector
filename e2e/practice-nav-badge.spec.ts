import { expect, test, type Page } from '@playwright/test';
import { apiUrl } from './api';

function randomWord(): string {
  let out = 'nb';
  for (let i = 0; i < 8; i++) out += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return out;
}

async function saveWord(page: Page, text: string) {
  const res = await page.request.post(apiUrl('/api/vocab'), {
    data: {
      text,
      type: 'word',
      language: 'af',
      state: 'level1',
      translation: `meaning of ${text}`,
      sentence: `Ek sien die ${text} vandag.`,
    },
  });
  expect(res.ok()).toBeTruthy();
}

async function removeLevel1Words(page: Page) {
  const rows = (await (await page.request.get(apiUrl('/api/vocab'))).json()) as Array<{
    id: string;
    state: string;
  }>;
  for (const row of rows) {
    if (row.state === 'level1') await page.request.delete(apiUrl(`/api/vocab/${row.id}`));
  }
}

test.describe.serial('Practice nav badge', () => {
  test.beforeEach(async ({ page }) => {
    await removeLevel1Words(page);
  });

  test.afterEach(async ({ page }) => {
    await removeLevel1Words(page);
  });

  test('shows how many saved words are ready, and clears on Practice', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/stats');
    await expect(page.getByTestId('nav-badge-desktop')).toHaveCount(0);

    await saveWord(page, randomWord());
    await saveWord(page, randomWord());
    await page.goto('/stats');
    await expect(page.getByTestId('nav-badge-desktop')).toHaveText('2');
    await expect(page.getByRole('link', { name: 'Practice', exact: true }).first()).toBeVisible();

    await page.getByRole('link', { name: 'Practice', exact: true }).first().click();
    await expect(page).toHaveURL(/\/practice$/);
    await expect(page.getByTestId('word-review-entry')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('nav-badge-desktop')).toHaveCount(0);
  });

  test('shows on the phone bottom bar and Review words is one tap away', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await saveWord(page, randomWord());
    await page.goto('/stats');
    await expect(page.getByTestId('nav-badge-mobile')).toHaveText('1');

    await page.getByTestId('nav-badge-mobile').locator('xpath=preceding-sibling::a').click();
    const open = page.getByTestId('word-review-open');
    await expect(open).toBeInViewport({ ratio: 1 });
    await open.click();
    await expect(page.getByTestId('word-review-round')).toBeVisible();
  });
});
