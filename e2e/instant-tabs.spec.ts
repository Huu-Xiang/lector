import { test, expect, type Page, type Route } from '@playwright/test';
import { apiUrl } from './api';

function hold(page: Page, pattern: string) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  void page.route(pattern, async (route: Route) => {
    await gate;
    await route.continue();
  });
  return () => release();
}

async function createLesson(page: Page, text: string): Promise<string> {
  const collection = await page.request.post(apiUrl('/api/collections'), {
    data: { title: `Instant ${Date.now()}`, author: 'E2E', language: 'af' },
  });
  const { id: collectionId } = await collection.json();
  const lesson = await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons`), {
    data: { title: 'Hoofstuk 1', textContent: text },
  });
  const { id } = await lesson.json();
  return id as string;
}

test.describe('Instant tabs and books', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('a revisited tab shows its last content before the network answers', async ({ page }) => {
    await page.goto('/stats');
    await expect(page.locator('[data-testid="stats-top-cards"]')).toBeVisible({ timeout: 15000 });

    const release = hold(page, '**/api/stats/fluency*');
    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('[data-testid="stats-top-cards"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="stats-skeleton"]')).toHaveCount(0);
    release();
  });

  test('a first visit with nothing remembered shows the page outline, not a spinner', async ({
    page,
  }) => {
    const release = hold(page, '**/api/vocab?*');
    await page.goto('/vocab', { waitUntil: 'commit' });
    await expect(page.locator('[data-testid="page-outline"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.animate-spin')).toHaveCount(0);
    release();
    await expect(page.locator('[data-testid="page-outline"]')).toHaveCount(0, { timeout: 10000 });
  });

  test('switching tabs and back keeps the scroll position', async ({ page }) => {
    await page.goto('/stats');
    await expect(page.locator('[data-testid="stats-top-cards"]')).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(300);

    await page.locator('nav a[href="/vocab"]').first().click();
    await expect(page).toHaveURL(/\/vocab$/);
    await page.locator('nav a[href="/stats"]').first().click();
    await expect(page).toHaveURL(/\/stats$/);

    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBe(400);
  });

  test('a recently read lesson reopens with its text before the network answers', async ({
    page,
  }) => {
    const lessonId = await createLesson(page, 'Die kat sit op die mat in die son.');
    await page.goto(`/read/${lessonId}`);
    await expect(page.getByText('Die kat sit op die mat')).toBeVisible({ timeout: 15000 });

    const release = hold(page, `**/api/lessons/${lessonId}`);
    await page.reload({ waitUntil: 'commit' });
    await expect(page.getByText('Die kat sit op die mat')).toBeVisible({ timeout: 10000 });
    release();
  });

  test('a lesson still reopens at once after reading saved its progress', async ({ page }) => {
    const paragraph = 'Die kat sit op die mat in die son. '.repeat(40);
    const lessonId = await createLesson(page, Array(30).fill(paragraph).join('\n\n'));
    await page.goto(`/read/${lessonId}`);
    await expect(page.getByText('Die kat sit op die mat').first()).toBeVisible({ timeout: 15000 });

    const saved = page.waitForResponse(
      (res) => res.url().includes(`/api/lessons/${lessonId}/progress`) && res.ok(),
    );
    await page.getByText('Die kat sit op die mat').first().hover();
    await page.mouse.wheel(0, 2000);
    await saved;

    const release = hold(page, `**/api/lessons/${lessonId}`);
    await page.reload({ waitUntil: 'commit' });
    await expect(page.getByText('Die kat sit op die mat').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="page-outline"]')).toHaveCount(0);
    release();
  });

  test('a lesson never opened shows the outline while its text loads', async ({ page }) => {
    const lessonId = await createLesson(page, 'Die hond blaf vir die posman.');
    const release = hold(page, `**/api/lessons/${lessonId}`);
    await page.goto(`/read/${lessonId}`, { waitUntil: 'commit' });
    await expect(page.locator('[data-testid="page-outline"]')).toBeVisible({ timeout: 10000 });
    release();
    await expect(page.getByText('Die hond blaf vir die posman.')).toBeVisible({ timeout: 10000 });
  });
});
