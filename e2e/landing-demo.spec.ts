import { test, expect, type Locator, type Page } from '@playwright/test';

const word = (page: Page, sentence: number, index: number): Locator =>
  page.locator(`[data-testid="demo-word"][data-sentence="${sentence}"][data-index="${index}"]`);

const card = (page: Page) => page.getByTestId('landing-demo');
const panel = (page: Page) => page.getByTestId('demo-panel');

async function dragAcross(page: Page, sentence: number, last: number) {
  const from = (await word(page, sentence, 0).boundingBox())!;
  const to = (await word(page, sentence, last).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}

async function dragRange(page: Page, sentence: number, first: number, last: number) {
  const from = (await word(page, sentence, first).boundingBox())!;
  const to = (await word(page, sentence, last).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}

const selectedWords = (page: Page, sentence: number) =>
  page.locator(`[data-testid="demo-word"][data-sentence="${sentence}"][data-selected]`);

test.describe('landing demo with a Chinese browser', () => {
  test.use({ locale: 'zh-CN' });

  test('shows the English sentences with Chinese meanings', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/landing');
    await expect(card(page)).toHaveAttribute('data-set', 'zh');
    const sentences = page.getByTestId('demo-sentence');
    await expect(sentences.nth(0)).toHaveText('She was tired, so she went to bed early.');
    await expect(sentences.nth(0)).toHaveAttribute('lang', 'en');
    await expect(panel(page)).toContainText('银行');
    await expect(panel(page).getByTestId('demo-context-text')).toContainText('河岸');
    await word(page, 0, 2).click();
    await expect(panel(page)).toContainText('① 累的，疲倦的 ② 厌倦的');
    await expect(panel(page).locator('[lang="zh-CN"]').first()).toBeVisible();
  });

  test('hydrates without a mismatch', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/landing');
    await expect(card(page)).toHaveAttribute('data-phase', 'auto');
    expect(errors.filter((text) => /hydrat|did not match/i.test(text))).toEqual([]);
  });

  test('a page opened in a background tab starts when it becomes visible', async ({ page }) => {
    await page.addInitScript(() => {
      const state = window as unknown as { demoHidden: boolean };
      state.demoHidden = true;
      Object.defineProperty(document, 'hidden', { get: () => state.demoHidden });
    });
    await page.goto('/landing');
    await expect(card(page)).toBeVisible();
    await expect(card(page)).not.toHaveAttribute('data-phase', 'auto');
    await page.evaluate(() => {
      (window as unknown as { demoHidden: boolean }).demoHidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(card(page)).toHaveAttribute('data-phase', 'auto');
  });

  test('an interface language cookie decides the set', async ({ page, context }) => {
    await context.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: 'http://localhost:3456' }]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/landing');
    await expect(card(page)).toHaveAttribute('data-set', 'en');
    await expect(page.getByTestId('demo-sentence').nth(1)).toHaveText(
      "Marie commençait à se lasser d'attendre son frère sur le quai.",
    );
    await expect(panel(page)).toContainText('train platform');
    await expect(page.getByTestId('demo-start-free')).toHaveText('Start free');

    await dragRange(page, 1, 0, 1);
    await expect(panel(page)).toContainText('Marie commençait');
    await expect(panel(page)).toContainText('Marie was beginning');
    await expect(panel(page)).not.toContainText('Marie was beginning to get tired');
    await expect(panel(page)).not.toContainText('Idiom');
    await expect(selectedWords(page, 1)).toHaveCount(2);

    await dragRange(page, 1, 8, 10);
    await expect(panel(page)).toContainText('on the platform');
    await expect(selectedWords(page, 1)).toHaveCount(3);

    await dragRange(page, 1, 0, 10);
    await expect(panel(page)).toContainText('Marie was beginning to get tired of waiting');
    await expect(panel(page)).toContainText('Idiom');
  });

  test('the guided path reaches Start free', async ({ page }) => {
    await page.goto('/landing');
    await expect(card(page)).toHaveAttribute('data-phase', 'step-word', { timeout: 45_000 });
    await expect(page.getByTestId('demo-prompt')).toContainText('发亮的词');

    await word(page, 1, 14).click();
    await expect(card(page)).toHaveAttribute('data-phase', 'step-context');
    await expect(panel(page)).toContainText('河岸，堤');

    await page.getByTestId('demo-context').click();
    await expect(card(page)).toHaveAttribute('data-phase', 'step-sentence');
    await expect(page.getByTestId('demo-context-text')).toContainText('不是“银行”');

    await dragAcross(page, 1, 14);
    await expect(card(page)).toHaveAttribute('data-phase', 'done');
    await expect(panel(page)).toContainText('爱丽丝坐在河岸上，挨着姐姐，渐渐觉得很厌烦了。');
    await expect(panel(page)).toContainText('惯用含义');
    await expect(page.getByTestId('demo-prompt')).toContainText('其他词也可以点');
    await expect(page.getByTestId('demo-start-free')).toHaveAttribute('href', '/register');
  });

  test('the guided drag step accepts a partial drag and shows its phrase', async ({ page }) => {
    await page.goto('/landing');
    await expect(card(page)).toHaveAttribute('data-phase', 'step-word', { timeout: 45_000 });
    await word(page, 1, 14).click();
    await expect(card(page)).toHaveAttribute('data-phase', 'step-context');
    await page.getByTestId('demo-context').click();
    await expect(card(page)).toHaveAttribute('data-phase', 'step-sentence');

    await dragRange(page, 1, 7, 9);
    await expect(card(page)).toHaveAttribute('data-phase', 'done');
    await expect(panel(page)).toContainText('tired of sitting by her sister on the bank');
    await expect(panel(page)).toContainText('厌烦坐在河岸上，挨着她姐姐');
    await expect(panel(page)).not.toContainText('惯用含义');
    await expect(selectedWords(page, 1)).toHaveCount(9);
  });

  test('a partial drag shows the phrase translation and no note', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/landing');
    await expect(card(page)).toHaveAttribute('data-phase', 'done');

    await dragRange(page, 1, 0, 2);
    await expect(panel(page)).toContainText('Alice was beginning');
    await expect(panel(page)).toContainText('爱丽丝开始');
    await expect(panel(page)).not.toContainText('爱丽丝靠着姐姐');
    await expect(panel(page)).not.toContainText('惯用含义');
    await expect(selectedWords(page, 1)).toHaveCount(3);

    await dragRange(page, 1, 12, 14);
    await expect(panel(page)).toContainText('在河岸上');
    await expect(selectedWords(page, 1)).toHaveCount(3);

    // No phrase holds "of sitting by", so the highlight grows to the smallest one that does.
    await dragRange(page, 1, 7, 9);
    await expect(panel(page)).toContainText('厌烦坐在河岸上，挨着她姐姐');
    await expect(selectedWords(page, 1)).toHaveCount(9);
    await expect(selectedWords(page, 1).first()).toHaveAttribute('data-index', '6');

    await dragRange(page, 1, 0, 14);
    await expect(panel(page)).toContainText('爱丽丝坐在河岸上，挨着姐姐，渐渐觉得很厌烦了。');
    await expect(panel(page)).toContainText('惯用含义');
    await expect(selectedWords(page, 1)).toHaveCount(15);

    await dragRange(page, 1, 1, 14);
    await expect(panel(page)).toContainText('爱丽丝坐在河岸上，挨着姐姐，渐渐觉得很厌烦了。');
    await expect(selectedWords(page, 1)).toHaveCount(15);
  });

  test('a drag across one word stays a word lookup', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/landing');
    await dragRange(page, 1, 6, 6);
    await expect(panel(page)).toContainText('厌倦的');
    await expect(selectedWords(page, 1)).toHaveCount(0);
  });

  test('a visitor who does nothing sees the run finish by itself', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/landing');
    await expect(card(page)).toHaveAttribute('data-phase', 'done', { timeout: 100_000 });
    await expect(panel(page)).toContainText('爱丽丝坐在河岸上，挨着姐姐，渐渐觉得很厌烦了。');
    await expect(page.getByTestId('demo-start-free')).toBeVisible();
  });

  test('tapping another word mid-run takes over', async ({ page }) => {
    await page.goto('/landing');
    await expect(card(page)).toHaveAttribute('data-phase', 'auto');
    await expect(page.getByTestId('demo-control')).toHaveText('暂停');

    await word(page, 0, 8).click();
    await expect(card(page)).toHaveAttribute('data-phase', 'free');
    await expect(panel(page)).toContainText('床');
    await expect(page.getByTestId('demo-cursor')).toHaveCSS('opacity', '0');
    await expect(page.getByTestId('demo-control')).toHaveText('重播');

    await page.waitForTimeout(2000);
    await expect(card(page)).toHaveAttribute('data-phase', 'free');
    await expect(panel(page)).toContainText('床');

    await dragAcross(page, 0, 9);
    await expect(panel(page)).toContainText('她累了，所以早早上床睡觉了。');
    await expect(page.getByTestId('demo-start-free')).toHaveCount(0);
  });

  test('Pause stops the run and Replay starts it again', async ({ page }) => {
    await page.goto('/landing');
    await expect(card(page)).toHaveAttribute('data-phase', 'auto');
    await page.getByTestId('demo-control').click();
    await expect(card(page)).toHaveAttribute('data-phase', 'free');
    await page.getByTestId('demo-control').click();
    await expect(card(page)).toHaveAttribute('data-phase', 'auto');
  });

  test('reduced motion shows the finished result and no animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/landing');
    await expect(card(page)).toHaveAttribute('data-phase', 'done');
    await expect(page.getByTestId('demo-cursor')).toHaveCSS('opacity', '0');
    await expect(page.getByTestId('demo-control')).toBeHidden();
    await expect(page.locator('.demo-pulse, .demo-wash')).toHaveCount(0);
    await expect(page.getByTestId('demo-start-free')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(card(page)).toHaveAttribute('data-phase', 'done');

    await word(page, 1, 6).click();
    await expect(panel(page)).toContainText('厌倦的');
    await dragAcross(page, 1, 14);
    await expect(panel(page)).toContainText('爱丽丝坐在河岸上，挨着姐姐，渐渐觉得很厌烦了。');
  });
});

test.describe('landing demo language sets', () => {
  const cases = [
    { locale: 'zh-CN', set: 'zh', sentence: 'She was tired, so she went to bed early.' },
    { locale: 'ja-JP', set: 'ja', sentence: 'She was tired, so she went to bed early.' },
    { locale: 'ko-KR', set: 'ko', sentence: 'She was tired, so she went to bed early.' },
    { locale: 'ru-RU', set: 'ru', sentence: 'She was tired, so she went to bed early.' },
    { locale: 'es-ES', set: 'es', sentence: 'She was tired, so she went to bed early.' },
    { locale: 'fr-FR', set: 'fr', sentence: 'She was tired, so she went to bed early.' },
    { locale: 'en-US', set: 'en', sentence: "Elle était fatiguée, alors elle s'est couchée tôt." },
    { locale: 'de-DE', set: 'en', sentence: "Elle était fatiguée, alors elle s'est couchée tôt." },
  ];

  for (const { locale, set, sentence } of cases) {
    for (const width of [320, 640, 1280]) {
      test.describe(`${locale} at ${width}px`, () => {
        test.use({ locale, viewport: { width, height: 900 } });

        test(`set ${set} fits its panel`, async ({ page }) => {
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.goto('/landing');
          await expect(card(page)).toHaveAttribute('data-set', set);
          await expect(page.getByTestId('demo-sentence').first()).toHaveText(sentence);
          const before = (await card(page).boundingBox())!.height;

          const overflow = await page.evaluate(async () => {
            const box = document.querySelector<HTMLElement>('[data-testid="demo-panel"]')!;
            const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
            const problems: string[] = [];
            const check = (label: string) => {
              if (box.scrollHeight > box.clientHeight) {
                problems.push(`${label}: ${box.scrollHeight} > ${box.clientHeight}`);
              }
            };
            for (const el of document.querySelectorAll<HTMLElement>('[data-testid="demo-word"]')) {
              el.click();
              await frame();
              check(el.textContent ?? '');
              const context = document.querySelector<HTMLElement>('[data-testid="demo-context"]');
              if (context) {
                context.click();
                await frame();
                check(`${el.textContent} + context`);
              }
            }
            return problems;
          });
          expect(overflow).toEqual([]);

          for (const [index, last] of [
            [0, 10],
            [1, 15],
          ] as const) {
            const tokens = await page
              .locator(`[data-testid="demo-word"][data-sentence="${index}"]`)
              .count();
            const lastWord = await page
              .locator(`[data-testid="demo-word"][data-sentence="${index}"]`)
              .last()
              .getAttribute('data-index');
            expect(tokens).toBeGreaterThan(2);
            await dragAcross(page, index, Number(lastWord ?? last));
            const fits = await panel(page).evaluate((el) => el.scrollHeight <= el.clientHeight);
            expect(fits).toBe(true);
          }

          const longest =
            set === 'en'
              ? ([
                  [0, 4, 8],
                  [0, 5, 8],
                  [1, 0, 5],
                  [1, 5, 10],
                ] as const)
              : ([
                  [0, 4, 9],
                  [1, 0, 7],
                  [1, 6, 14],
                ] as const);
          for (const [index, first, last] of longest) {
            await dragRange(page, index, first, last);
            await expect(selectedWords(page, index)).not.toHaveCount(0);
            const fits = await panel(page).evaluate((el) => el.scrollHeight <= el.clientHeight);
            expect(fits, `${index}:${first}-${last}`).toBe(true);
          }

          expect((await card(page).boundingBox())!.height).toBe(before);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
        });
      });
    }
  }
});
