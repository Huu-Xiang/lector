import { test, expect, Page } from '@playwright/test';
import http from 'http';
import type { AddressInfo } from 'net';
import { apiUrl } from './api';

/**
 * Phrase translation streams into the drawer: text shows while the answer is still being
 * written, and the final structured answer replaces it. Playwright cannot send a partial
 * response body, so a small local server plays the API and holds the stream open.
 */

const TITLE = 'Streaming Phrase Test';

interface MockStream {
  url: string;
  requests: Array<Record<string, unknown>>;
  release: () => void;
  close: () => Promise<void>;
}

async function startMockStream(first: string, final: unknown): Promise<MockStream> {
  const requests: Array<Record<string, unknown>> = [];
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', String(req.headers.origin ?? '*'));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push(JSON.parse(body || '{}'));
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.write(`${JSON.stringify({ delta: first })}\n`);
      void released.then(() => {
        res.write(`${JSON.stringify({ result: final })}\n`);
        res.end();
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api/translate`,
    requests,
    release,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function openLesson(page: Page): Promise<string> {
  const colRes = await page.request.post(apiUrl('/api/collections'), {
    data: { title: TITLE, language: 'af' },
  });
  const { id: collectionId } = await colRes.json();
  await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons`), {
    data: {
      title: 'Hoofstuk 1',
      textContent: 'By die see sien sy n seemeeu wat oor die water vlieg.',
    },
  });
  const lessons = await (
    await page.request.get(apiUrl(`/api/collections/${collectionId}/lessons`))
  ).json();
  await page.goto(`/read/${lessons[0].id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('seemeeu')).toBeVisible({ timeout: 10000 });
  return collectionId;
}

async function selectPhrase(page: Page) {
  const words = page.locator('article span.cursor-pointer');
  const from = await words.filter({ hasText: /^die$/ }).first().boundingBox();
  const to = await words
    .filter({ hasText: /^sien$/ })
    .first()
    .boundingBox();
  if (!from || !to) throw new Error('word boxes not found');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2);
  await page.mouse.up();
}

test.describe('Reader: streamed phrase translation', () => {
  let collectionId = '';
  let mock: MockStream | null = null;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const res = await page.request.get(apiUrl('/api/collections'));
    for (const c of await res.json()) {
      if (c.title === TITLE) await page.request.delete(apiUrl(`/api/collections/${c.id}`));
    }
  });

  test.afterEach(async ({ page }) => {
    mock?.release();
    await mock?.close();
    mock = null;
    if (collectionId) await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
    collectionId = '';
  });

  test('shows text before the answer completes, then the final answer', async ({ page }) => {
    mock = await startMockStream('the sea sees', {
      translation: 'the sea sees (final)',
      literalBreakdown: 'literal breakdown text',
    });
    const target = mock.url;
    await page.route('**/api/translate', (route) => route.continue({ url: target }));
    collectionId = await openLesson(page);

    await selectPhrase(page);

    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer).toHaveClass(/translate-x-0/, { timeout: 5000 });
    await expect(drawer.getByText('the sea sees', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(drawer.getByText('literal breakdown text')).toHaveCount(0);
    expect(mock.requests[0]).toMatchObject({ type: 'phrase', stream: true });

    mock.release();
    await expect(drawer.getByText('the sea sees (final)')).toBeVisible({ timeout: 5000 });
    await expect(drawer.getByText('literal breakdown text')).toBeVisible();
  });

  test('a plain JSON answer from the server still renders', async ({ page }) => {
    await page.route('**/api/translate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ translation: 'plain answer', usageNotes: 'a note' }),
      }),
    );
    collectionId = await openLesson(page);

    await selectPhrase(page);

    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer.getByText('plain answer')).toBeVisible({ timeout: 5000 });
  });

  test('a stream error shows the failure message', async ({ page }) => {
    await page.route('**/api/translate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: `${JSON.stringify({ delta: 'part' })}\n${JSON.stringify({ error: 'Translation failed' })}\n`,
      }),
    );
    collectionId = await openLesson(page);

    await selectPhrase(page);

    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer).toHaveClass(/translate-x-0/, { timeout: 5000 });
    await expect(drawer.locator('p.text-destructive')).toContainText('Failed to translate phrase', {
      timeout: 5000,
    });
    await expect(drawer.getByText('part', { exact: true })).toHaveCount(0);
  });
});
