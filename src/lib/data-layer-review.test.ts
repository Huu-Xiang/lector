import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('./api-base', () => ({ apiFetch }));
vi.mock('./language-cache', () => ({
  activeTenantId: () => 'local',
  readLanguageCache: () => 'fr',
}));

import {
  getReviewCounts,
  getReviewGoal,
  getReviewQueue,
  setReviewGoal,
  submitReviewAnswer,
  undoReviewAnswer,
} from './data-layer';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe('review reads', () => {
  it('passes the active language to counts and the queue', async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse({ dueNow: 2, newAvailable: 5, nextDue: null }))
      .mockResolvedValueOnce(jsonResponse({ roundId: 'r1', items: [] }));

    expect(await getReviewCounts()).toEqual({ dueNow: 2, newAvailable: 5, nextDue: null });
    await getReviewQueue(10);

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/review/counts?language=fr');
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/review/queue?language=fr&limit=10');
  });

  it('throws the server message when the queue cannot load', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ error: 'Review is unavailable' }, 409));
    await expect(getReviewQueue()).rejects.toThrow('Review is unavailable');
  });
});

describe('review writes', () => {
  it('posts an answer with the client event id', async () => {
    const result = { cardId: 'c1', eventId: 'e1', stage: 'learning', due: 'x', requeue: false };
    apiFetch.mockResolvedValueOnce(jsonResponse(result));
    const input = {
      roundId: 'r1',
      eventId: 'e1',
      cardId: 'c1',
      rawAnswer: 'know' as const,
      questionType: 'recognition' as const,
    };

    expect(await submitReviewAnswer(input)).toEqual(result);
    expect(apiFetch).toHaveBeenCalledWith('/api/review/answer?language=fr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('posts an undo and rejects on a 409', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ error: 'Too late to undo' }, 409));
    await expect(
      undoReviewAnswer({ roundId: 'r1', eventId: 'e1', newEventId: 'e2' }),
    ).rejects.toThrow('Too late to undo');
    expect(apiFetch.mock.calls[0][0]).toBe('/api/review/undo?language=fr');
  });
});

describe('review goal setting', () => {
  it('defaults to recognize and reads the stored value', async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse('recognize_spell'));
    expect(await getReviewGoal()).toBe('recognize');
    expect(await getReviewGoal()).toBe('recognize_spell');
  });

  it('writes the goal through the settings API', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
    await setReviewGoal('recognize_spell');
    expect(apiFetch).toHaveBeenCalledWith('/api/settings/reviewGoal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'recognize_spell' }),
    });
  });
});
