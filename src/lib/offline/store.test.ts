import { describe, expect, it } from 'vitest';
import {
  MAX_CACHED_LESSONS,
  cacheLesson,
  dropLesson,
  emptyOfflineState,
  enqueueWord,
  flushQueue,
  forgetOtherUsers,
  parseOfflineState,
  type OfflineLesson,
  type QueuedWord,
  type SendResult,
} from './store';

const lesson = (
  id: string,
  userId = 'u1',
  openedAt = '2026-11-05T10:00:00.000Z',
): OfflineLesson => ({
  userId,
  id,
  title: `Lesson ${id}`,
  language: 'en',
  text: 'My father had a small estate.',
  openedAt,
});

const word = (vocabId: string, extra: Partial<QueuedWord> = {}): QueuedWord => ({
  userId: 'u1',
  vocabId,
  text: 'estate',
  type: 'word',
  sentence: 'My father had a small estate.',
  language: 'en',
  lessonId: 'l1',
  createdAt: '2026-11-05T10:00:00.000Z',
  ...extra,
});

describe('cacheLesson', () => {
  it('keeps the five most recent lessons and drops the oldest on the sixth', () => {
    let state = emptyOfflineState();
    for (let i = 1; i <= MAX_CACHED_LESSONS + 1; i++) state = cacheLesson(state, lesson(`l${i}`));
    expect(state.lessons.map((l) => l.id)).toEqual(['l6', 'l5', 'l4', 'l3', 'l2']);
  });

  it('moves a reopened lesson to the front instead of adding a copy', () => {
    let state = cacheLesson(cacheLesson(emptyOfflineState(), lesson('a')), lesson('b'));
    state = cacheLesson(state, lesson('a', 'u1', '2026-11-06T10:00:00.000Z'));
    expect(state.lessons.map((l) => l.id)).toEqual(['a', 'b']);
    expect(state.lessons[0].openedAt).toBe('2026-11-06T10:00:00.000Z');
  });

  it('drops a lesson that no longer exists on the server', () => {
    const state = cacheLesson(cacheLesson(emptyOfflineState(), lesson('a')), lesson('b'));
    expect(dropLesson(state, 'u1', 'a').lessons.map((l) => l.id)).toEqual(['b']);
  });
});

describe('forgetOtherUsers', () => {
  it('removes cached lessons and queued words that belong to another user', () => {
    let state = cacheLesson(emptyOfflineState(), lesson('a', 'u1'));
    state = enqueueWord(state, word('w1', { userId: 'u1' }));
    state = enqueueWord(state, word('w2', { userId: 'u2' }));
    const kept = forgetOtherUsers(state, 'u2');
    expect(kept.lessons).toEqual([]);
    expect(kept.queue.map((w) => w.vocabId)).toEqual(['w2']);
  });
});

describe('flushQueue', () => {
  const sendAll = (results: Record<string, SendResult>) => async (w: QueuedWord) =>
    results[w.vocabId] ?? 'ok';

  it('sends each entry for the signed-in user once and empties the queue', async () => {
    const state = enqueueWord(enqueueWord(emptyOfflineState(), word('w1')), word('w2'));
    const out = await flushQueue(state, 'u1', sendAll({}));
    expect(out.saved).toBe(2);
    expect(out.state.queue).toEqual([]);
  });

  it('drops a rejected entry, saves the valid entry after it, and reports the rejection', async () => {
    const state = enqueueWord(enqueueWord(emptyOfflineState(), word('bad')), word('good'));
    const sent: string[] = [];
    const out = await flushQueue(state, 'u1', async (w) => {
      sent.push(w.vocabId);
      return w.vocabId === 'bad' ? 'rejected' : 'ok';
    });
    expect(sent).toEqual(['bad', 'good']);
    expect(out.saved).toBe(1);
    expect(out.rejected).toBe(1);
    expect(out.state.queue).toEqual([]);
  });

  it('keeps an entry on a network error or 5xx and continues to the next', async () => {
    const state = enqueueWord(enqueueWord(emptyOfflineState(), word('slow')), word('fine'));
    const out = await flushQueue(state, 'u1', sendAll({ slow: 'retry' }));
    expect(out.saved).toBe(1);
    expect(out.state.queue.map((w) => w.vocabId)).toEqual(['slow']);
  });

  it("posts nothing for another user's entries and drops them", async () => {
    const state = enqueueWord(emptyOfflineState(), word('theirs', { userId: 'u1' }));
    const sent: string[] = [];
    const out = await flushQueue(state, 'u2', async (w) => {
      sent.push(w.vocabId);
      return 'ok';
    });
    expect(sent).toEqual([]);
    expect(out.state.queue).toEqual([]);
  });
});

describe('parseOfflineState', () => {
  it('survives missing, broken, or foreign data', () => {
    expect(parseOfflineState(null)).toEqual(emptyOfflineState());
    expect(parseOfflineState('not json')).toEqual(emptyOfflineState());
    expect(parseOfflineState('{"version":9}')).toEqual(emptyOfflineState());
  });

  it('round-trips a saved state', () => {
    const state = enqueueWord(cacheLesson(emptyOfflineState(), lesson('a')), word('w1'));
    expect(parseOfflineState(JSON.stringify(state))).toEqual(state);
  });
});
