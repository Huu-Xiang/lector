import { expect, test } from '@playwright/test';
import { apiUrl } from './api';

test.use({
  viewport: { width: 393, height: 852 },
  userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ReadfoxApp/1 ReadfoxOS/18',
});

test('Reduce Motion removes native press transforms and transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const action = page.getByTestId('free-books-btn');
  await action.hover();
  await page.mouse.down();
  try {
    await expect(action).toHaveCSS('transform', 'none');
    await expect(action).toHaveCSS('transition-duration', '0s');
  } finally {
    await page.mouse.up();
  }
});

test('a single vocabulary day shows a milestone and desktop retains the chart', async ({
  page,
}) => {
  const now = new Date().toISOString();
  await page.route(/\/api\/vocab(?:\?|$)/, (route) =>
    route.fulfill({
      json: [
        {
          id: 'milestone-word',
          text: 'tuin',
          type: 'word',
          sentence: 'Die tuin is groen.',
          translation: 'garden',
          state: 'level1',
          stateUpdatedAt: now,
          createdAt: now,
          reviewCount: 0,
          pushedToAnki: false,
          language: 'af',
        },
      ],
    }),
  );
  await page.goto('/stats');
  await expect(page.getByTestId('vocab-growth-sparse')).toBeVisible();
  await expect(page.getByTestId('vocab-growth-sparse')).toContainText('Known Words');
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.getByTestId('vocab-growth-sparse')).toHaveCount(0);
  await expect(
    page.getByTestId('compact-vocab-growth').locator('.recharts-responsive-container'),
  ).toBeVisible();
});

test('inline Fill-in words retain natural prose sizing', async ({ page }) => {
  await page.goto('/practice');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const word = page.getByTestId('cloze-word').first();
  await expect(word).toBeVisible();
  const style = await word.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      display: computed.display,
      minWidth: computed.minWidth,
      minHeight: computed.minHeight,
    };
  });
  expect(style.display).toBe('inline');
  expect(parseFloat(style.minWidth) || 0).toBeLessThan(44);
  expect(parseFloat(style.minHeight) || 0).toBeLessThan(44);
});

test('Continue Reading resumes the latest unfinished chapter and hides during search or completion', async ({
  page,
}) => {
  const title = `Continue reading ${Date.now()}`;
  const response = await page.request.post(apiUrl('/api/collections'), {
    data: { title, language: 'af' },
  });
  expect(response.ok()).toBeTruthy();
  const { id } = await response.json();
  try {
    for (const chapter of ['First', 'Second']) {
      const created = await page.request.post(apiUrl(`/api/collections/${id}/lessons`), {
        data: { title: chapter, textContent: 'Die tuin is groen. '.repeat(200) },
      });
      expect(created.ok()).toBeTruthy();
    }
    const lessons = await (await page.request.get(apiUrl(`/api/collections/${id}/lessons`))).json();
    expect(
      (
        await page.request.put(apiUrl(`/api/lessons/${lessons[1].id}/progress?language=af`), {
          data: { scrollPosition: 450, percentComplete: 48 },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto('/');
    const resume = page.getByTestId('native-continue-reading').filter({ hasText: title });
    await expect(resume).toHaveAttribute('href', `/read/${lessons[1].id}`);
    await expect(resume).toBeVisible();
    await page.getByTestId('library-search-input').fill('no-matching-book');
    await expect(resume).toBeHidden();
    await page.getByTestId('library-search-input').fill('');
    await expect(resume).toBeVisible();
    await page.setViewportSize({ width: 820, height: 1180 });
    await expect(resume).toBeHidden();
    await page.setViewportSize({ width: 393, height: 852 });
    await resume.click();
    await expect(page).toHaveURL(`/read/${lessons[1].id}`);
    await page.goto('/me');
    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Me', exact: true }),
    ).toBeVisible();
    for (const lesson of lessons) {
      expect(
        (
          await page.request.put(apiUrl(`/api/lessons/${lesson.id}/progress?language=af`), {
            data: { scrollPosition: 9999, percentComplete: 100 },
          })
        ).ok(),
      ).toBeTruthy();
    }
    await page.goto('/');
    await expect(resume).toHaveCount(0);
  } finally {
    await page.request.delete(apiUrl(`/api/collections/${id}`));
  }
});
