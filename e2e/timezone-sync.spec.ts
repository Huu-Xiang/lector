import { test, expect } from '@playwright/test';
import { apiUrl } from './api';

const BROWSER_ZONE = 'Asia/Tokyo';

async function storedZone(page: import('@playwright/test').Page): Promise<unknown> {
  const res = await page.request.get(apiUrl('/api/settings/timezone'));
  return res.json();
}

test.describe('Time zone sync', () => {
  test.use({ timezoneId: BROWSER_ZONE });

  test.beforeEach(async ({ page }) => {
    await page.request.delete(apiUrl('/api/settings/timezone'));
  });

  test.afterEach(async ({ page }) => {
    await page.request.delete(apiUrl('/api/settings/timezone'));
  });

  test('a page load saves the browser zone when none is stored', async ({ page }) => {
    expect(await storedZone(page)).toBeNull();
    await page.goto('/stats');
    await expect.poll(() => storedZone(page)).toBe(BROWSER_ZONE);
  });

  test('a stored zone is not overwritten', async ({ page }) => {
    await page.request.put(apiUrl('/api/settings/timezone'), { data: { value: 'Europe/Paris' } });
    await page.goto('/stats');
    await page.waitForLoadState('networkidle');
    expect(await storedZone(page)).toBe('Europe/Paris');
  });

  test('the Auto choice (empty value) is not overwritten', async ({ page }) => {
    await page.request.put(apiUrl('/api/settings/timezone'), { data: { value: '' } });
    await page.goto('/stats');
    await page.waitForLoadState('networkidle');
    expect(await storedZone(page)).toBe('');
  });
});
