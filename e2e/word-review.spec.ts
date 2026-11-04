import { test, expect, type Page } from '@playwright/test';
import { apiUrl } from './api';

function randomWord(): string {
  let out = 'wr';
  for (let i = 0; i < 8; i++) out += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return out;
}

async function saveWord(page: Page, text: string, translation: string) {
  const res = await page.request.post(apiUrl('/api/vocab'), {
    data: {
      text,
      type: 'word',
      language: 'af',
      state: 'level1',
      translation,
      sentence: `Ek sien die ${text} vandag.`,
    },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe.serial('Word review', () => {
  const words = [0, 1, 2, 3].map((i) => ({
    text: randomWord(),
    meaning: `meaning-${i}-${Date.now()}`,
  }));

  test('saved words reach Practice and change stage after an answer', async ({ page }) => {
    for (const w of words) await saveWord(page, w.text, w.meaning);

    await page.goto('/practice');
    await expect(page.getByTestId('word-review-entry')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('word-review-counts')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();

    await page.getByTestId('word-review-open').click();
    await expect(page.getByTestId('word-review-round')).toBeVisible();

    let sawStageChange = false;
    for (let guard = 0; guard < 60; guard++) {
      if (await page.getByTestId('word-review-summary').isVisible()) break;

      if (await page.getByTestId('choose-meaning').isVisible()) {
        const shown = (await page.getByTestId('choose-meaning').locator('bdi').innerText()).trim();
        const known = words.find((w) => w.text === shown);
        const choice = known
          ? page.getByTestId('word-choice').filter({ hasText: known.meaning })
          : page.getByTestId('word-choice').first();
        await choice.click();
        const badge = page.getByTestId('stage-badge').first();
        await expect(badge).toBeVisible();
        if (known) {
          await expect(badge).toHaveAttribute('data-stage', 'learning');
          sawStageChange = true;
        }
        await page.getByTestId('word-next').click();
      } else if (await page.getByTestId('recognition-card').isVisible()) {
        await page.keyboard.press('Space');
        await page.keyboard.press('3');
      } else if (await page.getByTestId('fill-in').isVisible()) {
        await page.getByTestId('word-choice').first().click();
        await page.getByTestId('word-next').click();
      } else if (await page.getByTestId('typed-fill-in').isVisible()) {
        await page.getByRole('button', { name: 'Show answer' }).click();
        await page.getByTestId('word-next').click();
      } else {
        await page.waitForTimeout(100);
      }
    }

    await expect(page.getByTestId('word-review-summary')).toBeVisible();
    expect(sawStageChange).toBe(true);
    await expect(page.getByTestId('stage-changes')).toBeVisible();
  });

  test('I was wrong appears after Know and sends the card back', async ({ page }) => {
    await saveWord(page, randomWord(), 'solo');
    await page.goto('/practice');
    await page.getByTestId('word-review-open').click();
    await expect(page.getByTestId('word-review-round')).toBeVisible();
    await expect(page.getByTestId('was-wrong')).toHaveCount(0);

    for (let guard = 0; guard < 60; guard++) {
      if (await page.getByTestId('recognition-card').isVisible()) {
        await page.keyboard.press('Space');
        await page.keyboard.press('3');
        break;
      }
      if (await page.getByTestId('choose-meaning').isVisible()) {
        await page.getByTestId('word-choice').first().click();
        await page.getByTestId('word-next').click();
      } else if (await page.getByTestId('word-review-summary').isVisible()) {
        return;
      } else {
        await page.waitForTimeout(100);
      }
    }

    await expect(page.getByTestId('was-wrong')).toBeVisible();
    await page.getByTestId('was-wrong').click();
    await expect(page.getByTestId('was-wrong')).toHaveCount(0);
    await expect(page.getByTestId('recognition-card')).toBeVisible();
  });

  test('review goal is set in Settings and shown on the Practice entry', async ({ page }) => {
    await page.goto('/settings');
    const spell = page.getByTestId('review-goal-recognize_spell');
    await spell.click();
    await expect(spell).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/practice');
    await expect(page.getByTestId('word-review-goal-link')).toContainText('Recognize and spell');

    await page.goto('/settings');
    await expect(page.getByTestId('review-goal-recognize_spell')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByTestId('review-goal-recognize').click();
    await expect(page.getByTestId('review-goal-recognize')).toHaveAttribute('aria-pressed', 'true');
  });
});
