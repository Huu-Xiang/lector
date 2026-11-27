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
          if (
            element instanceof HTMLInputElement &&
            ['checkbox', 'radio', 'range'].includes(element.type)
          ) {
            const label = element.labels?.[0];
            if (label) {
              const hitBox = label.getBoundingClientRect();
              return hitBox.width < 44 || hitBox.height < 44;
            }
          }
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
    if (path === '/' || path === '/stats' || path === '/practice') {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.evaluate((scheme) => {
          document.documentElement.classList.toggle('dark', scheme === 'dark');
        }, colorScheme);
        const tracks = page.locator(
          '.native-segment-track, .native-library-view, [data-testid="library-search-input"], [data-testid="stats-range-selector"]',
        );
        for (const track of await tracks.all()) {
          if (!(await track.isVisible())) continue;
          const surface = await track.evaluate((element) => {
            const style = getComputedStyle(element);
            const probe = document.createElement('span');
            probe.style.background = 'var(--ios-fill)';
            element.appendChild(probe);
            const fill = getComputedStyle(probe).backgroundColor;
            probe.remove();
            return {
              background: style.backgroundColor,
              fill,
              radius: parseFloat(style.borderRadius),
            };
          });
          expect(surface.background).toBe(surface.fill);
          expect(surface.background).not.toBe('rgba(0, 0, 0, 0)');
          expect(surface.radius).toBeGreaterThanOrEqual(12);
        }
      }
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
    }
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
    data: { title: 'Morning Walk in Kyoto', language: 'af' },
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
    await page.goto('/');
    const details = page
      .getByTestId('collection-details')
      .and(page.getByRole('link', { name: /Morning Walk in Kyoto/ }));
    await expect(details).toBeVisible();
    const cover = details.locator('..').getByTestId('collection-cover');
    const title = cover.locator('p').filter({ hasText: 'Morning Walk in Kyoto' });
    await expect(title).toBeVisible();
    const textEdge = await title.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return Math.max(...Array.from(range.getClientRects(), (rect) => rect.right));
    });
    const circle = (await details.locator('span').boundingBox())!;
    expect(textEdge).toBeLessThanOrEqual(circle.x);
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
