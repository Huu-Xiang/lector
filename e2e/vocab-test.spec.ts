import { test, expect, type Browser } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { VocabReport } from '../languages/en/vocab-report';
import { apiUrl } from './api';

const CLOUD_API = `http://localhost:${process.env.E2E_AUTH_API_PORT || '3462'}`;

async function loggedOutPage(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

/** A visitor with no cloud session. The report email is captured by the test API. */
async function cloudVisitorPage(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await context.route('**/__env.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.__ENV__ = ${JSON.stringify({ API_URL: CLOUD_API, LECTOR_MODE: 'cloud' })};`,
    }),
  );
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
  await answerAll(page, 'vocab-not-sure', 8);
  await expect(page.getByTestId('vocab-finish')).toBeEnabled();
  await expect(page.getByTestId('vocab-result-progress')).toHaveCount(0);
  await expect(page.getByTestId('vocab-result-ready')).toHaveText('Result available');
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
    await expect(page.getByTestId('vocab-continue-setup')).toHaveCount(0);
    await expect(page.getByTestId('vocab-precision')).toContainText('8 words answered');
    await expect(page.getByTestId('vocab-missed')).toBeVisible();

    await page.getByTestId('vocab-retake').click();
    await expect(page.getByTestId('vocab-answered')).toHaveText('0 answered');
    await context.close();
  });

  test('keeps the prompt English and shows Russian choices, feedback and results', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ locale: 'ru-RU' });
    try {
      const page = await context.newPage();
      await page.goto(new URL('/vocab-test', baseURL).href);
      await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
      await page.getByTestId('vocab-start').click();
      await expect(page.getByTestId('vocab-word')).toHaveText(/^[a-z]+$/i);
      const options = page.getByTestId('vocab-option');
      await expect(options).toHaveCount(4);
      for (let i = 0; i < 3; i++) {
        await expect(options.nth(i).locator('[lang="ru"]').first()).toHaveText(/[а-яё]/i);
        await expect(options.nth(i).locator('[lang="en"]')).toHaveCount(0);
      }
      await expect(page.getByTestId('vocab-card')).toHaveAttribute('data-state', 'asking');
      await page.getByTestId('vocab-not-sure').click();
      await expect(page.getByTestId('vocab-feedback')).toContainText(/[а-яё]/i);
      await expect(page.getByTestId('vocab-announcement')).toContainText(/[а-яё]/i);
      await page.getByTestId('vocab-word').click();
      await answerAll(page, 'vocab-not-sure', 7);
      await page.getByTestId('vocab-finish').click();
      await expect(page.getByTestId('vocab-result')).toBeVisible();
      await page.getByTestId('vocab-missed').locator('summary').click();
      await expect(page.getByTestId('vocab-missed').locator('[lang="ru"]').first()).toHaveText(
        /[а-яё]/i,
      );
      await expect(page.getByTestId('vocab-book').first()).toHaveAttribute(
        'href',
        /^\/books\/en\//,
      );
    } finally {
      await context.close();
    }
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
    await expect(page.getByTestId('vocab-estimate-change')).toContainText('First estimate');
    await expect(page.getByTestId('vocab-word')).not.toHaveText(first ?? '', { timeout: 4000 });
    await expect(page.getByTestId('vocab-answered')).toHaveText('1 answered');
    await expect(page.getByTestId('vocab-result-progress')).toHaveAttribute('aria-valuenow', '1');
    await expect(page.getByTestId('vocab-live-estimate')).toContainText('±');
    await expect(page.getByTestId('vocab-option').locator('[lang=en]')).toHaveCount(0);

    // Picking option 1: it is marked right, or wrong with the right one marked too.
    await expect(card).toHaveAttribute('data-state', 'asking');
    await options.first().click();
    await expect(page.getByTestId('vocab-estimate-change')).toContainText('Estimate');
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
    expect(result.estimate).toBeLessThan(1500);
    await expect(page.getByTestId('vocab-precision')).toContainText('8 words answered');
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

  test('the complete cloud result is visible before asking for an account', async ({ browser }) => {
    const { context, page } = await cloudVisitorPage(browser);
    await page.goto('/vocab-test');
    await finishKnowingNothing(page);
    await expect(page.getByTestId('vocab-estimate')).toBeVisible();
    await expect(page.getByTestId('vocab-book').first()).toBeVisible();
    await expect(page.getByTestId('vocab-report-auth-prompt')).toHaveCount(0);
    await expect(page.getByTestId('vocab-save-level')).toHaveCount(0);
    await page.getByTestId('vocab-save-report').click();
    await expect(page.getByTestId('vocab-report-login')).toBeVisible();
    await expect(page.getByTestId('vocab-report-register')).toBeVisible();
    await context.close();
  });

  test('an expired verification callback keeps its saved report sign-in path', async ({
    browser,
  }) => {
    test.skip(!!process.env.E2E_EXTERNAL_SERVER, 'requires a cloud account session');
    const { context, page } = await cloudVisitorPage(browser);
    const attemptId = randomUUID();
    const snapshot = {
      attemptId,
      takenAt: new Date().toISOString(),
      locale: 'en',
      estimate: 4000,
      margin: 500,
      low: 3500,
      high: 4500,
      capped: false,
      level: 'B2',
      bookSlugs: [],
    };
    await page.addInitScript(
      (draft) =>
        localStorage.setItem(
          `readfox-vocab-report-draft:${draft.attemptId}`,
          JSON.stringify(draft),
        ),
      { attemptId, snapshot, expiresAt: Date.now() + 60_000 },
    );
    try {
      await page.goto(`/vocab-test?resume=report&draft=${attemptId}&error=invalid_token`);
      await expect(page.getByTestId('vocab-report-resume-error')).toContainText(
        /could not be verified/i,
      );
      const login = page.getByTestId('vocab-report-login');
      await expect(login).toHaveAttribute(
        'href',
        `/login?next=%2Fvocab-test%3Fresume%3Dreport%26draft%3D${attemptId}`,
      );
    } finally {
      await context.close();
    }
  });

  test('registration resumes the same result and sends one PDF', async ({ browser }) => {
    test.skip(!!process.env.E2E_EXTERNAL_SERVER, 'requires the cloud API and file outbox');
    const { context, page } = await cloudVisitorPage(browser);
    const email = `report+${randomUUID()}@e2e.test`;
    const outbox = path.join(__dirname, '..', 'tmp', 'e2e-data-cloud', 'emails.jsonl');
    type Mail = {
      to: string;
      subject: string;
      text: string;
      attachments?: { filename: string; content: string }[];
    };
    function mail(): Mail[] {
      try {
        return readFileSync(outbox, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as Mail)
          .filter((item) => item.to === email);
      } catch {
        return [];
      }
    }
    const pdfMail = () => mail().filter((message) => message.attachments?.length);
    try {
      await page.goto('/vocab-test');
      await finishKnowingNothing(page);
      const estimate = await page.getByTestId('vocab-estimate').innerText();
      await page.getByTestId('vocab-save-report').click();
      await page.getByTestId('vocab-report-register').click();
      await page.getByTestId('register-name').fill('Report Reader');
      await page.getByTestId('register-email').fill(email);
      await page.getByTestId('register-password').fill('report-password-123');
      await page.getByTestId('register-confirm-password').fill('report-password-123');
      await page.getByTestId('register-submit').click();
      await expect(page.getByTestId('register-check-email')).toBeVisible();
      await expect
        .poll(() => mail().filter((message) => /verify/i.test(message.subject)).length)
        .toBe(1);
      const verify = mail().find((message) => /verify/i.test(message.subject));
      const link = verify?.text.match(/https?:\/\/\S+/)?.[0];
      expect(link).toBeTruthy();

      // The email is opened in a second tab of the same browser.
      const callback = await context.newPage();
      await callback.goto(link!);
      await expect.poll(() => pdfMail().length).toBe(1);
      const attachment = pdfMail()[0]?.attachments?.[0];
      expect(attachment?.filename).toMatch(/\.pdf$/);
      expect(
        Buffer.from(attachment?.content ?? '', 'base64')
          .subarray(0, 5)
          .toString(),
      ).toBe('%PDF-');

      const reportsUrl = `${CLOUD_API}/api/vocab-test-reports`;
      const history = await context.request.get(reportsUrl);
      expect(history.ok()).toBe(true);
      const { reports } = (await history.json()) as { reports: VocabReport[] };
      expect(reports).toHaveLength(1);
      expect(reports[0]?.snapshot.level).toBe('A1');
      expect(reports[0]?.deliveryStatus).toBe('sent');

      const session = await (await context.request.get(`${CLOUD_API}/api/auth/get-session`)).json();
      const duplicate = await context.request.post(reportsUrl, {
        data: { expectedUserId: session.user.id, snapshot: reports[0]?.snapshot },
      });
      expect(duplicate.ok()).toBe(true);
      expect(pdfMail()).toHaveLength(1);

      const backupResponse = await context.request.get(`${CLOUD_API}/api/data`);
      expect(backupResponse.ok()).toBe(true);
      const backup = (await backupResponse.json()) as {
        vocabTestReports?: Array<{
          snapshot: VocabReport['snapshot'];
          books: VocabReport['books'];
        }>;
      };
      const savedAt = Date.parse(reports[0]!.snapshot.takenAt);
      const historyRows = Array.from({ length: 30 }, (_, index) => ({
        snapshot: {
          attemptId: randomUUID(),
          takenAt: new Date(savedAt - (index + 1) * 1000).toISOString(),
          locale: 'en' as const,
          estimate: 4000,
          margin: 500,
          low: 3500,
          high: 4500,
          capped: false,
          level: 'B2' as const,
          bookSlugs: [],
        },
        books: [],
      }));
      backup.vocabTestReports = [...(backup.vocabTestReports ?? []), ...historyRows];
      const restoreResponse = await context.request.post(`${CLOUD_API}/api/data`, {
        data: backup,
      });
      expect(restoreResponse.ok()).toBe(true);

      // Simulate a stale client view after a successful send. The server should
      // return the authoritative sent state without sending the same email again.
      await callback.route('**/api/vocab-test-reports', async (route) => {
        const response = await route.fetch();
        const page = (await response.json()) as { reports: VocabReport[] };
        if (page.reports[0]) page.reports[0] = { ...page.reports[0], deliveryStatus: 'failed' };
        await route.fulfill({ response, json: page });
      });
      await callback.goto('/vocab-test/history');
      await expect(callback.getByTestId('vocab-report-record')).toHaveCount(30);
      await expect(callback.getByTestId('vocab-report-record').first()).toContainText(estimate);
      await expect(callback.getByTestId('vocab-report-status').first()).toContainText(
        /PDF email could not be sent/i,
      );
      const retry = callback.getByTestId('vocab-report-retry').first();
      await expect(retry).toBeVisible();
      await callback.unroute('**/api/vocab-test-reports');
      await retry.click();
      await expect(callback.getByTestId('vocab-report-status').first()).toHaveText(
        'Email service accepted the PDF.',
      );
      await expect(callback.getByTestId('vocab-report-retry')).toHaveCount(0);
      expect(pdfMail()).toHaveLength(1);

      await callback.route('**/api/vocab-test-reports', async (route) => {
        const response = await route.fetch();
        const page = (await response.json()) as { reports: VocabReport[] };
        if (page.reports[0]) {
          page.reports[0] = {
            ...page.reports[0],
            deliveryStatus: 'unknown',
            retryUntil: Date.now() - 1,
          };
        }
        await route.fulfill({ response, json: page });
      });
      await callback.reload();
      await expect(callback.getByTestId('vocab-report-status').first()).toHaveText(
        'We could not confirm the email was sent. Check your inbox.',
      );
      await expect(callback.getByTestId('vocab-report-retry')).toHaveCount(0);
      await callback.unroute('**/api/vocab-test-reports');

      await callback.getByTestId('vocab-report-load-more').click();
      await expect(callback.getByTestId('vocab-report-record')).toHaveCount(31);
      await expect(callback.getByTestId('vocab-report-load-more')).toHaveCount(0);

      const recovery = await cloudVisitorPage(browser);
      try {
        const attemptId = randomUUID();
        const snapshot: VocabReport['snapshot'] = {
          attemptId,
          takenAt: new Date().toISOString(),
          locale: 'en',
          estimate: 0,
          margin: 500,
          low: 0,
          high: 500,
          capped: false,
          level: 'A1',
          bookSlugs: [],
        };
        await recovery.page.addInitScript(
          ({ attemptId, snapshot }) => {
            localStorage.setItem(
              `readfox-vocab-report-draft:${attemptId}`,
              JSON.stringify({ snapshot, expiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000 }),
            );
          },
          { attemptId, snapshot },
        );
        await recovery.page.goto(`/vocab-test?resume=report&draft=${attemptId}`);
        await expect(recovery.page.getByTestId('vocab-report-auth-prompt')).toBeVisible();
        await recovery.page.getByTestId('vocab-report-login').click();
        await recovery.page.getByTestId('login-email').fill(`typo-${email}`);
        await recovery.page.getByTestId('login-password').fill('report-password-123');
        await recovery.page.getByTestId('login-submit').click();
        await expect(recovery.page.getByText('Invalid email or password.')).toBeVisible();
        await recovery.page.getByTestId('login-email').fill(email);
        await recovery.page.getByTestId('login-submit').click();
        await expect(recovery.page.getByTestId('vocab-report-saved')).toBeVisible();
        await expect.poll(() => pdfMail().length).toBe(2);
      } finally {
        await recovery.context.close();
      }
    } finally {
      await context.close();
    }
  });

  test('a learner with an account saves the test level and can change it in settings', async ({
    page,
  }) => {
    const levelsUrl = apiUrl('/api/settings/readingLevels');
    const languagesUrl = apiUrl('/api/settings/enabledLanguages');
    const read = async (url: string) => {
      const response = await page.request.get(url);
      return response.ok() ? ((await response.json()) as unknown) : null;
    };
    const restore = async (url: string, value: unknown) => {
      if (value === null) await page.request.delete(url);
      else await page.request.put(url, { data: { value } });
    };
    const levelsBefore = await read(levelsUrl);
    const languagesBefore = await read(languagesUrl);
    try {
      await page.request.put(levelsUrl, { data: { value: { en: 'C1' } } });
      await page.goto('/vocab-test');
      await finishKnowingNothing(page);
      await expect(page.getByTestId('vocab-report-auth-prompt')).toHaveCount(0);
      await expect(page.getByTestId('vocab-current-level')).toContainText('C1');
      await page.getByTestId('vocab-save-level-button').click();
      await expect(page.getByTestId('vocab-level-saved')).toContainText('A1');
      expect(await read(levelsUrl)).toEqual({ en: 'A1' });
      await expect(page.getByTestId('vocab-back-library')).toHaveAttribute('href', '/');

      await page.request.put(languagesUrl, { data: { value: ['en'] } });
      await page.goto('/settings');
      const english = page.getByTestId('reading-level-en');
      await expect(english.getByTestId('reading-level-en-A1')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(english.getByTestId('settings-vocab-test-link')).toHaveAttribute(
        'href',
        '/vocab-test?from=settings',
      );
      await english.getByTestId('reading-level-en-B2').click();
      await expect(english.getByTestId('reading-level-en-B2')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect.poll(() => read(levelsUrl)).toEqual({ en: 'B2' });
    } finally {
      await restore(levelsUrl, levelsBefore);
      await restore(languagesUrl, languagesBefore);
    }
  });

  test('search and AI entry points: landing link, FAQ and structured data', async ({ browser }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/landing');
    await expect(page.getByTestId('landing-vocab-test-link')).toHaveAttribute(
      'href',
      '/vocab-test',
    );
    await page.goto('/vocab-test');
    const faq = page.getByTestId('vocab-faq').locator('details');
    await expect(faq).toHaveCount(4);
    await expect(faq.first().locator('p')).toBeHidden();
    await faq.first().locator('summary').click();
    await expect(faq.first().locator('p')).toContainText('first three words');
    await expect(faq.first().locator('p')).toBeVisible();
    const structured = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(structured.join('')).toContain('"FAQPage"');
    expect(structured.join('')).toContain('"WebApplication"');
    expect(await (await page.request.get('/llms.txt')).text()).toContain('/vocab-test');
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
