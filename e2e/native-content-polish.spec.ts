import { expect, test } from '@playwright/test';
import { apiUrl } from './api';

test.use({
  viewport: { width: 393, height: 852 },
  userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ReadfoxApp/1',
});

test('native Me and Feedback fill the viewport with one semantic page heading', async ({
  page,
}) => {
  await page.goto('/me');
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Me', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('main').locator('header')).toHaveCount(0);
  await page.goto('/feedback');
  const main = await page.getByRole('main').boundingBox();
  expect(main?.width).toBe(393);
  const message = page.getByTestId('feedback-message');
  await expect(message).not.toHaveAttribute('placeholder', /paste/i);
  await expect(message).toHaveCSS('resize', 'none');
  const send = await page.getByTestId('feedback-send').boundingBox();
  expect(send?.height).toBeGreaterThanOrEqual(48);
  const wechat = page.getByTestId('feedback-wechat');
  await wechat.locator('summary').click();
  await expect(wechat).toHaveAttribute('open', '');
  await expect(wechat.locator('summary')).toHaveCSS('list-style-type', 'none');
});

test('native collection uses numbered chapters and keeps Add lesson outside its grouped list', async ({
  page,
}) => {
  const created = await page.request.post(apiUrl('/api/collections'), {
    data: { title: 'Native book hero test', author: 'Readfox', language: 'af' },
  });
  expect(created.ok()).toBeTruthy();
  const { id } = await created.json();
  try {
    const lesson = await page.request.post(apiUrl(`/api/collections/${id}/lessons`), {
      data: { title: 'First chapter', textContent: 'Die son skyn helder vandag.' },
    });
    expect(lesson.ok()).toBeTruthy();
    await page.goto(`/collection/${id}`);
    await expect(page.getByTestId('native-collection-cover')).toBeVisible();
    await expect(page.locator('.native-chapter-number').first()).toHaveText('1');
    await expect(page.locator('.native-chapter-number').first()).toBeVisible();
    await expect(page.getByTestId('lesson-heading')).toContainText('First chapter');
    await expect(page.locator('.native-collection-chapters').getByTestId('add-lesson')).toHaveCount(
      0,
    );
    await page.getByTestId('add-lesson').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  } finally {
    await page.request.delete(apiUrl(`/api/collections/${id}`));
  }
});

test('native journal composer has a quiet Cancel action and touch textarea', async ({ page }) => {
  await page.goto('/journal');
  await page.getByRole('button', { name: 'New Entry', exact: true }).click();
  const composer = page.locator('.native-journal-composer');
  await expect(composer.locator('textarea')).toHaveCSS('resize', 'none');
  await expect(composer.getByRole('button', { name: 'Cancel', exact: true })).not.toHaveClass(
    /bg-destructive/,
  );
  await composer.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(composer).toHaveCount(0);
});
