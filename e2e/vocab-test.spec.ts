import { test, expect, type Browser } from '@playwright/test';
import { apiUrl } from './api';

async function loggedOutPage(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

type Page = import('@playwright/test').Page;

/** Answer one word, then tap the word to skip the feedback pause. */
async function answerOne(page: Page, testId: string, nth = 0) {
  const card = page.getByTestId('vocab-card');
  await expect(card).toHaveAttribute('data-state', 'asking');
  await page.getByTestId(testId).nth(nth).click();
  await expect(card).toHaveAttribute('data-state', 'feedback');
  await page.getByTestId('vocab-word').click();
}

async function answerAll(page: Page, testId: string, count: number, nth = 0) {
  for (let i = 0; i < count; i++) await answerOne(page, testId, nth);
}

async function finishKnowingNothing(page: Page) {
  await page.getByTestId('vocab-start').click();
  await expect(page.getByTestId('vocab-word')).toBeVisible();
  await expect(page.getByTestId('vocab-option')).toHaveCount(4);
  await expect(page.getByTestId('vocab-option').last()).toHaveText(/None of these/);
  await expect(page.getByTestId('vocab-finish')).toBeDisabled();
  await answerAll(page, 'vocab-not-sure', 20);
  await expect(page.getByTestId('vocab-finish')).toBeEnabled();
  await page.getByTestId('vocab-finish').click();
  await expect(page.getByTestId('vocab-result')).toBeVisible();
}

test.describe('vocabulary test', () => {
  // Every answer shows feedback for a moment, so a full run takes longer than the default 30 s.
  test.describe.configure({ timeout: 120_000 });

  test('works logged out, shows A1 when every answer is not sure, recommends books, and retakes', async ({
    browser,
  }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await finishKnowingNothing(page);
    await expect(page.getByTestId('vocab-level')).toContainText('A1');
    await expect(page.getByTestId('vocab-estimate')).toContainText('0');
    await expect(page.getByTestId('vocab-book').first()).toHaveAttribute('href', /^\/books\/en\//);
    await expect(page.getByTestId('vocab-register')).toHaveAttribute('href', /book=en%2F/);
    await expect(page.getByTestId('vocab-continue-setup')).toHaveCount(0);
    await expect(page.getByTestId('vocab-precision')).toContainText('20 words answered');
    await expect(page.getByTestId('vocab-missed')).toBeVisible();

    await page.getByTestId('vocab-retake').click();
    await expect(page.getByTestId('vocab-answered')).toHaveText('0 answered');
    await context.close();
  });

  test('shows right or wrong, moves on by itself, and ignores taps meant for the last word', async ({
    browser,
  }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test');
    await page.getByTestId('vocab-start').click();
    const card = page.getByTestId('vocab-card');
    const options = page.getByTestId('vocab-option');
    await expect(page.getByTestId('vocab-live-estimate')).toContainText('until the first estimate');
    await expect(page.getByTestId('vocab-undo')).toHaveCount(0);

    // "Not sure" marks the right option and the next word comes without a tap.
    await expect(card).toHaveAttribute('data-state', 'asking');
    const first = await page.getByTestId('vocab-word').textContent();
    await page.getByTestId('vocab-not-sure').click();
    const answer = Number(await card.getAttribute('data-answer'));
    await expect(options.nth(answer)).toHaveAttribute('data-state', 'unsure');
    await expect(page.getByTestId('vocab-feedback')).toContainText('The right answer is marked');
    await expect(page.getByTestId('vocab-announcement')).toContainText(first ?? '');
    await expect(page.getByTestId('vocab-word')).not.toHaveText(first ?? '', { timeout: 4000 });
    await expect(page.getByTestId('vocab-answered')).toHaveText('1 answered');

    // Picking option 1: it is marked right, or wrong with the right one marked too.
    await expect(card).toHaveAttribute('data-state', 'asking');
    await options.first().click();
    const right = Number(await card.getAttribute('data-answer'));
    if (right === 0) {
      await expect(options.first()).toHaveAttribute('data-state', 'right');
    } else {
      await expect(options.first()).toHaveAttribute('data-state', 'wrong');
      await expect(options.nth(right)).toHaveAttribute('data-state', 'answer');
    }

    await page.getByTestId('vocab-word').click();

    // A double tap during feedback moves on once and does not answer the next word.
    await expect(card).toHaveAttribute('data-state', 'asking');
    await page.getByTestId('vocab-not-sure').click();
    // force: options are aria-disabled during feedback, and a real tap still lands on them.
    await options.first().dblclick({ force: true });
    await expect(page.getByTestId('vocab-answered')).toHaveText('3 answered');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('vocab-answered')).toHaveText('3 answered');
    await expect(card).toHaveAttribute('data-state', 'asking');

    // Keyboard: 0 is "not sure", any key moves on, and a key right after that is ignored.
    await page.keyboard.press('0');
    await expect(card).toHaveAttribute('data-state', 'feedback');
    await expect(page.getByTestId('vocab-answered')).toHaveText('4 answered');
    await page.keyboard.press('Enter');
    await page.keyboard.press('1');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('vocab-answered')).toHaveText('4 answered');
    await expect(card).toHaveAttribute('data-state', 'asking');
    await context.close();
  });

  test('shows the real meaning when "None of these" was the answer', async ({ browser }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test');
    await page.getByTestId('vocab-start').click();
    const card = page.getByTestId('vocab-card');
    // About one word in four has "None of these" as its answer.
    for (let i = 0; i < 30; i++) {
      await expect(card).toHaveAttribute('data-state', 'asking');
      await page.getByTestId('vocab-option').nth(1).click();
      if ((await card.getAttribute('data-answer')) === '3') {
        await expect(page.getByTestId('vocab-option').nth(3)).toHaveAttribute(
          'data-state',
          'answer',
        );
        await expect(page.getByTestId('vocab-true-meaning')).toBeVisible();
        await context.close();
        return;
      }
      await expect(page.getByTestId('vocab-true-meaning')).toHaveCount(0);
      await page.getByTestId('vocab-word').click();
    }
    throw new Error('no "None of these" answer in 30 words');
  });

  test('loads the word list only on Start and offers a retry when it fails', async ({
    browser,
  }) => {
    const { context, page } = await loggedOutPage(browser);
    const listRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/vocab-test/words')) listRequests.push(request.url());
    });
    await page.goto('/vocab-test');
    await expect(page.getByTestId('vocab-start')).toBeEnabled();
    expect(listRequests).toHaveLength(0);

    await page.route('**/vocab-test/words', (route) => route.abort());
    await page.getByTestId('vocab-start').click();
    await expect(page.getByTestId('vocab-load-error')).toBeVisible();
    await expect(page.getByTestId('vocab-start')).toHaveText('Try again');

    await page.unroute('**/vocab-test/words');
    await page.getByTestId('vocab-start').click();
    await expect(page.getByTestId('vocab-word')).toBeVisible();
    await context.close();
  });

  test('a retake asks words from the earlier test only when no new word fits', async ({
    browser,
  }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test');
    const word = page.getByTestId('vocab-word');
    const card = page.getByTestId('vocab-card');
    const first = new Set<string>();
    await page.getByTestId('vocab-start').click();
    for (let i = 0; i < 20; i++) {
      await expect(card).toHaveAttribute('data-state', 'asking');
      first.add((await word.textContent()) ?? '');
      await answerOne(page, 'vocab-not-sure');
    }
    const seen = await page.evaluate(() => localStorage.getItem('readfox-vocab-seen'));
    expect(new Set(JSON.parse(seen ?? '[]') as string[])).toEqual(first);

    await page.getByTestId('vocab-finish').click();
    await page.getByTestId('vocab-retake').click();
    for (let i = 0; i < 10; i++) {
      await expect(card).toHaveAttribute('data-state', 'asking');
      expect(first.has((await word.textContent()) ?? '')).toBe(false);
      await answerOne(page, 'vocab-not-sure');
    }
    await context.close();
  });

  test('the result is saved', async ({ browser }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test');
    await finishKnowingNothing(page);
    const saved = await page.evaluate(() => localStorage.getItem('readfox-vocab-result'));
    const result = JSON.parse(saved ?? 'null') as { estimate: number; level: string };
    expect(result.level).toBe('A1');
    expect(result.estimate).toBeLessThan(500);

    // Twenty "not sure" answers already pin the result down, so there is no "answer more".
    await expect(page.getByTestId('vocab-precision')).toContainText('high');
    await expect(page.getByTestId('vocab-continue')).toHaveCount(0);
    await context.close();
  });

  test('a wide result offers to answer more', async ({ browser }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test');
    await page.getByTestId('vocab-start').click();
    // Always picking option 2 is a guess on most words, which leaves the range wide.
    await answerAll(page, 'vocab-option', 20, 1);
    await page.getByTestId('vocab-finish').click();
    // A few random runs still end with a narrow range, and then the offer is rightly hidden.
    if ((await page.getByTestId('vocab-continue').count()) === 0) {
      await expect(page.getByTestId('vocab-precision')).toContainText('high');
      await context.close();
      return;
    }
    await page.getByTestId('vocab-continue').click();
    await expect(page.getByTestId('vocab-answered')).toHaveText('20 answered');
    await answerAll(page, 'vocab-not-sure', 1);
    await expect(page.getByTestId('vocab-answered')).toHaveText('21 answered');
    await context.close();
  });

  test('from setup the result offers to continue setup', async ({ browser }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test?from=setup');
    await finishKnowingNothing(page);
    await expect(page.getByTestId('vocab-continue-setup')).toHaveText('Use A1 and continue setup');
    await expect(page.getByTestId('vocab-continue-setup')).toHaveAttribute('href', '/setup');
    await context.close();
  });

  test('the books index links to the test', async ({ page }) => {
    await page.goto('/books');
    const link = page.getByTestId('books-vocab-test-link');
    await expect(link).toHaveAttribute('href', '/vocab-test');
    await link.click();
    await expect(page).toHaveURL(/\/vocab-test$/, { timeout: 30_000 });
  });

  test('the sitemap lists the test page', async ({ request }) => {
    expect(await (await request.get('/sitemap.xml')).text()).toContain('/vocab-test');
  });
  test('setup pre-selects the saved level for English only and keeps a manual pick', async ({
    browser,
  }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.addInitScript(() => {
      localStorage.setItem(
        'readfox-vocab-result',
        JSON.stringify({ estimate: 3000, level: 'B1', takenAt: Date.now() }),
      );
    });
    await page.request.delete(apiUrl('/api/settings/targetLanguage'));
    await page.goto('/setup');
    await expect(page.getByTestId('setup-vocab-test-link')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('setup-native-language').selectOption('de');
    await page.getByTestId('setup-language-en').click();
    await expect(page.getByTestId('setup-level-B1')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('setup-vocab-note')).toBeVisible();

    await page.getByTestId('setup-language-es').click();
    await expect(page.getByTestId('setup-level-B1')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('setup-level-unsure')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('setup-language-en').click();
    await page.getByTestId('setup-level-A2').click();
    await expect(page.getByTestId('setup-level-A2')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('setup-level-B1')).toHaveAttribute('aria-pressed', 'false');
    await context.close();
  });
});
