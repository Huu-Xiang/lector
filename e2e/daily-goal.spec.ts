import { test, expect, type Page } from '@playwright/test';
import { apiUrl } from './api';

interface Streak {
  streak: number;
  goal: { kind: string; target: number };
  goalProgress: number;
  goalMetToday: boolean;
}

const streakNow = async (page: Page) =>
  (await (await page.request.get(apiUrl('/api/stats/streak'))).json()) as Streak;

test.describe('Daily goal and streak', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.request.delete(apiUrl('/api/settings/dailyGoal'));
  });

  test.afterEach(async ({ page }) => {
    await page.request.delete(apiUrl('/api/settings/dailyGoal'));
  });

  test('the library shows the streak and today against the goal, and the menu changes the goal', async ({
    page,
  }) => {
    await page.goto('/');
    const badge = page.getByTestId('daily-goal-badge');
    await expect(badge).toBeVisible({ timeout: 15_000 });

    const before = await streakNow(page);
    expect(before.goal).toEqual({ kind: 'minutes', target: 5 });
    await expect(badge).toHaveAttribute('data-goal-met', String(before.goalMetToday));
    await expect(page.getByTestId('daily-goal-streak')).toHaveText(String(before.streak));

    await badge.click();
    await expect(page.getByTestId('daily-goal-menu')).toBeVisible();
    await page.getByTestId('daily-goal-option-reviews-30').click();

    await expect
      .poll(async () => (await page.request.get(apiUrl('/api/settings/dailyGoal'))).json())
      .toEqual({ kind: 'reviews', target: 30 });
    const after = await streakNow(page);
    await expect(badge).toHaveAttribute('data-goal-met', String(after.goalMetToday));
    await expect(badge).toHaveAccessibleName(new RegExp(`${after.goalProgress}/30`));
  });

  test('the settings choice changes the goal, and a day at the goal counts', async ({ page }) => {
    await page.request.put(apiUrl('/api/settings/dailyGoal'), {
      data: { value: { kind: 'minutes', target: 30 } },
    });
    await page.goto('/settings');
    const select = page.getByTestId('settings-daily-goal');
    await expect(select).toHaveValue('minutes:30', { timeout: 15_000 });

    const { goalProgress } = await streakNow(page);
    if (goalProgress < 5) {
      await page.request.put(apiUrl('/api/stats/today'), {
        data: { field: 'minutesRead', amount: 5 - goalProgress },
      });
    }
    await select.selectOption('minutes:5');
    await expect
      .poll(async () => (await page.request.get(apiUrl('/api/settings/dailyGoal'))).json())
      .toEqual({ kind: 'minutes', target: 5 });

    await page.goto('/');
    const badge = page.getByTestId('daily-goal-badge');
    await expect(badge).toHaveAttribute('data-goal-met', 'true', { timeout: 15_000 });
    expect((await streakNow(page)).streak).toBeGreaterThanOrEqual(1);
  });

  test('the goal setting rejects an unknown kind', async ({ page }) => {
    const res = await page.request.put(apiUrl('/api/settings/dailyGoal'), {
      data: { value: { kind: 'pages', target: 5 } },
    });
    expect(res.status()).toBe(400);
  });
});
