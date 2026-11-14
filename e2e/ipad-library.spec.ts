import { expect, test } from '@playwright/test';
import { apiUrl } from './api';

test.use({
  viewport: { width: 1180, height: 820 },
  userAgent: 'Mozilla/5.0 (iPad) AppleWebKit/605.1.15 ReadfoxApp/1',
});

test('iPad features a book and resumes its last unfinished chapter', async ({ page }) => {
  const bookTitle = 'The Garden Stories';
  const collection = await page.request.post(apiUrl('/api/collections'), {
    data: { title: bookTitle, language: 'af' },
  });
  expect(collection.ok()).toBeTruthy();
  const { id } = await collection.json();
  try {
    for (const title of ['First chapter', 'Second chapter']) {
      const created = await page.request.post(apiUrl(`/api/collections/${id}/lessons`), {
        data: { title, textContent: 'Die tuin is groen. Die blomme is mooi. '.repeat(100) },
      });
      expect(created.ok()).toBeTruthy();
    }
    const lessons = await (await page.request.get(apiUrl(`/api/collections/${id}/lessons`))).json();
    const secondId = lessons[1].id;
    const saved = await page.request.put(apiUrl(`/api/lessons/${secondId}/progress?language=af`), {
      data: { scrollPosition: 450, percentComplete: 48 },
    });
    expect(saved.ok()).toBeTruthy();

    await page.goto('/');
    const featured = page.getByTestId('ipad-featured-book');
    await expect(featured.getByRole('heading', { name: bookTitle })).toBeVisible();
    await expect(featured.getByRole('link', { name: 'Continue Reading' })).toHaveAttribute(
      'href',
      `/read/${secondId}`,
    );
    await expect(page.getByTestId('collection-card').filter({ hasText: bookTitle })).toBeVisible();

    await page.setViewportSize({ width: 500, height: 820 });
    await expect(featured).toBeHidden();
    await expect(page.getByTestId('collection-card').filter({ hasText: bookTitle })).toBeVisible();

    await page.setViewportSize({ width: 820, height: 1180 });
    await featured.getByRole('link', { name: 'Continue Reading' }).click();
    await expect(page).toHaveURL(`/read/${secondId}`);
  } finally {
    await page.request.delete(apiUrl(`/api/collections/${id}`));
  }
});
