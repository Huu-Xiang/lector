import { expect, test, type Page } from '@playwright/test';
import { apiUrl } from './api';

test.use({
  viewport: { width: 393, height: 852 },
  userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ReadfoxApp/1 ReadfoxOS/18',
});

async function expectPhoneGeometry(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-native-app', '');
  const geometry = await page.evaluate(() => {
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        box.width > 0 &&
        box.height > 0 &&
        style.visibility !== 'hidden' &&
        box.bottom > 0 &&
        box.top < innerHeight &&
        !element.closest('[inert], [aria-hidden="true"]')
      );
    };
    const describe = (element: Element) =>
      element.getAttribute('data-testid') ||
      element.getAttribute('aria-label') ||
      `${element.tagName}: ${element.textContent?.trim().slice(0, 60)}`;
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      smallControls: [...document.querySelectorAll('button,a,input,select')]
        .filter(visible)
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width < 44 || box.height < 44;
        })
        .map(describe),
      smallText: [...document.querySelectorAll('body *')]
        .filter(visible)
        .filter((element) =>
          [...element.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          ),
        )
        .filter((element) => parseFloat(getComputedStyle(element).fontSize) < 12)
        .map(describe),
    };
  });
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  expect(geometry.smallControls).toEqual([]);
  expect(geometry.smallText).toEqual([]);
}

test('native pages fill the phone and retain accessible control sizes', async ({ page }) => {
  for (const path of ['/', '/me', '/settings', '/stats', '/vocab', '/practice', '/setup']) {
    await page.goto(path);
    await expect(page.getByRole('main')).toBeVisible();
    await expect
      .poll(async () => Math.round((await page.getByRole('main').boundingBox())!.width))
      .toBe(393);
    await expectPhoneGeometry(page);
    if (path === '/settings') {
      for (const summary of await page.getByTestId('iphone-settings').locator('summary').all()) {
        await summary.click();
        await expectPhoneGeometry(page);
      }
    }
  }
});

test('reader and ListenAlong keep chat in the header and transport inside the screen', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/dictionary/lookup?*', (route) =>
    route.fulfill({
      json: { entry: { word: 'fees', senses: [{ partOfSpeech: 'noun', gloss: 'A festival.' }] } },
    }),
  );
  const response = await page.request.post(apiUrl('/api/collections'), {
    data: { title: 'iPhone layout', language: 'af' },
  });
  expect(response.ok()).toBeTruthy();
  const { id } = await response.json();
  try {
    const lessonResponse = await page.request.post(apiUrl(`/api/collections/${id}/lessons`), {
      data: {
        title: '1. Chapter 1. Sara',
        textContent: '# 1. Chapter 1. Sara\n\n## Chapter 1. Sara\n\nDie fees is gewild.',
      },
    });
    expect(lessonResponse.ok()).toBeTruthy();
    const lessons = await (await page.request.get(apiUrl(`/api/collections/${id}/lessons`))).json();
    await page.goto(`/read/${lessons[0].id}`);
    await expect(page.getByTestId('native-chat')).toBeVisible();
    await expect(page.locator('[data-chat-toggle]')).toHaveCount(0);
    await expectPhoneGeometry(page);
    await page.getByRole('button', { name: 'Look up fees', exact: true }).first().click();
    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer.getByText('A festival.', { exact: true }).first()).toBeInViewport();
    await expect(drawer.getByTestId('lookup-original-sentence')).toBeInViewport();
    const heading = (await drawer
      .getByRole('heading', { name: 'fees', exact: true })
      .boundingBox())!;
    const context = (await drawer.getByTestId('request-word-context').boundingBox())!;
    expect(Math.abs(context.y - heading.y)).toBeLessThan(24);
    await expectPhoneGeometry(page);
    await drawer.getByRole('button', { name: /close/i }).click();
    await page.getByTestId('listen-along-toggle').click();
    await expect(page.getByTestId('listen-along')).toBeVisible();
    await expectPhoneGeometry(page);
    for (const mode of ['continuous', 'shadow']) {
      await page.getByTestId(`listen-mode-${mode}`).click();
      await expectPhoneGeometry(page);
      for (const control of [
        'listen-speed',
        'listen-prev-sentence',
        'listen-play-pause',
        'listen-next-sentence',
      ]) {
        const box = (await page.getByTestId(control).boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(852);
      }
    }
  } finally {
    await page.request.delete(apiUrl(`/api/collections/${id}`));
  }
});
