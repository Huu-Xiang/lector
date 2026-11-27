import { test, expect, Page } from '@playwright/test';
import { apiUrl } from './api';

const TEST_TITLE = 'Inline Edit Test';
const ORIGINAL_TEXT = 'Die son skyn helder vandag. Ek loop deur die veld.';
const EDITED_TEXT = 'Die maan skyn helder vannag. Ek loop deur die straat.';

async function createLesson(page: Page): Promise<{ collectionId: string; lessonId: string }> {
  const colRes = await page.request.post(apiUrl('/api/collections'), {
    data: { title: TEST_TITLE, language: 'af' },
  });
  const { id: collectionId } = await colRes.json();

  await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons`), {
    data: { title: 'Hoofstuk 1', textContent: ORIGINAL_TEXT },
  });

  const lessonsRes = await page.request.get(apiUrl(`/api/collections/${collectionId}/lessons`));
  const lessons = await lessonsRes.json();
  return { collectionId, lessonId: lessons[0].id };
}

async function cleanupExisting(page: Page) {
  const res = await page.request.get(apiUrl('/api/collections'));
  const collections = await res.json();
  for (const c of collections) {
    if (c.title === TEST_TITLE) {
      await page.request.delete(apiUrl(`/api/collections/${c.id}`));
    }
  }
}

test.describe('Reader inline editing (issue #67)', () => {
  let collectionId: string;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await cleanupExisting(page);
    const created = await createLesson(page);
    collectionId = created.collectionId;
    await page.goto(`/read/${created.lessonId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('helder', { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    if (collectionId) {
      await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
    }
  });

  test('edit button toggles textarea, save persists changes', async ({ page }) => {
    const editButton = page.getByTestId('edit-text-button');
    await expect(editButton).toBeVisible();

    // Article rendered, textarea not yet present
    await expect(page.locator('article')).toBeVisible();
    await expect(page.getByTestId('edit-text-textarea')).toHaveCount(0);

    await editButton.click();

    // Textarea now visible with the original content
    const textarea = page.getByTestId('edit-text-textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(ORIGINAL_TEXT);

    // Article (tokenized view) is hidden in edit mode
    await expect(page.locator('article')).toHaveCount(0);

    // Edit button itself is gone, replaced by Cancel/Save
    await expect(page.getByTestId('edit-text-button')).toHaveCount(0);
    await expect(page.getByTestId('edit-text-cancel')).toBeVisible();
    await expect(page.getByTestId('edit-text-save')).toBeVisible();

    // Modify and save
    await textarea.fill(EDITED_TEXT);
    await page.getByTestId('edit-text-save').click();

    // Back to read mode, new content visible in the article
    await expect(page.getByTestId('edit-text-textarea')).toHaveCount(0);
    await expect(page.locator('article')).toBeVisible();
    await expect(page.locator('article')).toContainText('maan');
    await expect(page.locator('article')).toContainText('straat');
    await expect(page.locator('article')).not.toContainText('son skyn helder vandag');

    // Persisted in DB
    const lessonId = page.url().split('/').pop()!;
    const checkRes = await page.request.get(apiUrl(`/api/lessons/${lessonId}`));
    const persisted = await checkRes.json();
    expect(persisted.textContent).toBe(EDITED_TEXT);
  });

  test('cancel discards changes and restores the article', async ({ page }) => {
    await page.getByTestId('edit-text-button').click();
    const textarea = page.getByTestId('edit-text-textarea');
    await expect(textarea).toBeVisible();

    await textarea.fill('totally different text that should not persist');
    await page.getByTestId('edit-text-cancel').click();

    // Article restored with original content
    await expect(page.getByTestId('edit-text-textarea')).toHaveCount(0);
    await expect(page.locator('article')).toContainText('vandag');
    await expect(page.locator('article')).not.toContainText('totally different');

    // DB still has the original
    const lessonId = page.url().split('/').pop()!;
    const checkRes = await page.request.get(apiUrl(`/api/lessons/${lessonId}`));
    const persisted = await checkRes.json();
    expect(persisted.textContent).toBe(ORIGINAL_TEXT);
  });

  test('back button is disabled while editing', async ({ page }) => {
    const backButton = page.getByRole('button', { name: /back/i }).first();
    await expect(backButton).toBeEnabled();

    await page.getByTestId('edit-text-button').click();
    await expect(backButton).toBeDisabled();

    await page.getByTestId('edit-text-cancel').click();
    await expect(backButton).toBeEnabled();
  });
});

test.describe('Native iPhone reader editing', () => {
  test.use({
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 ReadfoxApp/1',
  });

  test('Display menu opens the same editor and persists changes', async ({ page }) => {
    const { collectionId, lessonId } = await createLesson(page);
    try {
      await page.goto(`/read/${lessonId}`);
      await expect(page.getByTestId('edit-text-button')).toBeHidden();
      await page.getByTestId('reader-display-menu-btn').click();
      const edit = page
        .getByTestId('reader-display-menu')
        .getByRole('menuitem', { name: 'Edit text', exact: true });
      await expect(edit).toBeVisible();
      await edit.click();
      await expect(page.getByTestId('edit-text-textarea')).toHaveValue(ORIGINAL_TEXT);
      await expect(page.getByTestId('edit-text-textarea')).toBeFocused();
      await page.getByTestId('edit-text-textarea').fill(EDITED_TEXT);
      await page.getByTestId('edit-text-save').click();
      await expect(page.getByTestId('edit-text-textarea')).toHaveCount(0);
      await expect(page.locator('article')).toContainText('vannag');
      const persisted = await (await page.request.get(apiUrl(`/api/lessons/${lessonId}`))).json();
      expect(persisted.textContent).toBe(EDITED_TEXT);
      await page.setViewportSize({ width: 820, height: 1180 });
      await expect(page.getByTestId('edit-text-button')).toBeVisible();
    } finally {
      await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
    }
  });

  test('cloud reading difficulty lives in Display and submits once', async ({ page, baseURL }) => {
    if (!baseURL) throw new Error('The reader test requires a UI baseURL');
    const uiOrigin = new URL(baseURL).origin;
    const apiOrigin = new URL(apiUrl('/')).origin;
    await page.route('**/__env.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `window.__ENV__ = ${JSON.stringify({ API_URL: new URL(apiUrl('/')).origin, LECTOR_MODE: 'cloud' })};`,
      }),
    );
    await page.route(
      (url) => url.origin === apiOrigin && url.pathname.startsWith('/api/'),
      async (route) => {
        const request = route.request();
        const headers = {
          'access-control-allow-origin': uiOrigin,
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers':
            request.headers()['access-control-request-headers'] ?? 'content-type',
        };
        if (request.method() === 'OPTIONS') {
          await route.fulfill({ status: 204, headers });
          return;
        }
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/product-analytics') {
          await route.fulfill({ headers, json: { ok: true } });
          return;
        }
        const response = await route.fetch();
        const responseHeaders: Record<string, string> = { ...response.headers(), ...headers };
        if (pathname === '/api/bootstrap') {
          delete responseHeaders['content-length'];
          delete responseHeaders['content-encoding'];
          delete responseHeaders['transfer-encoding'];
          await route.fulfill({
            response,
            headers: responseHeaders,
            json: { ...(await response.json()), mode: 'cloud', targetLanguage: 'af' },
          });
          return;
        }
        await route.fulfill({ response, headers: responseHeaders });
      },
    );
    const { collectionId, lessonId } = await createLesson(page);
    try {
      await page.goto(`/read/${lessonId}`);
      await expect(page.getByTestId('reading-difficulty')).toBeHidden();
      await page.getByTestId('reader-display-menu-btn').click();
      const choices = page.getByTestId('native-reading-difficulty');
      await expect(choices).toBeVisible();
      const request = page.waitForRequest(
        (request) =>
          request.url().endsWith('/api/product-analytics') &&
          request.postDataJSON()?.data?.event === 'reading_difficulty',
      );
      await choices.getByRole('menuitem').nth(1).click();
      expect((await request).postDataJSON().data).toMatchObject({
        outcome: 'just_right',
        lessonId,
        language: 'af',
      });
      await page.getByTestId('reader-display-menu-btn').click();
      await expect(page.getByTestId('native-reading-difficulty')).toHaveCount(0);
    } finally {
      await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
    }
  });
});
