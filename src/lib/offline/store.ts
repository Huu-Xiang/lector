/**
 * Pure state rules for offline reading. The bundled launcher
 * (`ios-app/launcher/offline-reader.js`) reads and writes the same JSON file,
 * so keep the field names in step with it.
 */
export const OFFLINE_FILE = 'offline.json';
export const MAX_CACHED_LESSONS = 5;

export interface OfflineLesson {
  userId: string;
  id: string;
  title: string;
  language: string;
  text: string;
  openedAt: string;
}

export interface QueuedWord {
  userId: string;
  /** Client-made id; `POST /api/vocab` upserts on it, so a repeat changes nothing. */
  vocabId: string;
  text: string;
  type: 'word' | 'phrase';
  sentence: string;
  language: string;
  lessonId: string;
  createdAt: string;
}

export interface OfflineState {
  version: 1;
  lessons: OfflineLesson[];
  queue: QueuedWord[];
}

/** ok and rejected leave the queue; retry keeps the entry for the next flush. */
export type SendResult = 'ok' | 'rejected' | 'retry';

export const emptyOfflineState = (): OfflineState => ({ version: 1, lessons: [], queue: [] });

export function parseOfflineState(raw: string | null | undefined): OfflineState {
  if (!raw) return emptyOfflineState();
  try {
    const value = JSON.parse(raw) as Partial<OfflineState>;
    if (value.version !== 1) return emptyOfflineState();
    return {
      version: 1,
      lessons: Array.isArray(value.lessons) ? value.lessons : [],
      queue: Array.isArray(value.queue) ? value.queue : [],
    };
  } catch {
    return emptyOfflineState();
  }
}

export function cacheLesson(state: OfflineState, lesson: OfflineLesson): OfflineState {
  const others = state.lessons.filter((l) => !(l.userId === lesson.userId && l.id === lesson.id));
  return { ...state, lessons: [lesson, ...others].slice(0, MAX_CACHED_LESSONS) };
}

export function dropLesson(state: OfflineState, userId: string, lessonId: string): OfflineState {
  return {
    ...state,
    lessons: state.lessons.filter((l) => !(l.userId === userId && l.id === lessonId)),
  };
}

export function forgetOtherUsers(state: OfflineState, userId: string): OfflineState {
  return {
    ...state,
    lessons: state.lessons.filter((l) => l.userId === userId),
    queue: state.queue.filter((w) => w.userId === userId),
  };
}

export function enqueueWord(state: OfflineState, word: QueuedWord): OfflineState {
  return { ...state, queue: [...state.queue, word] };
}

export async function flushQueue(
  state: OfflineState,
  userId: string,
  send: (word: QueuedWord) => Promise<SendResult>,
): Promise<{ state: OfflineState; saved: number; rejected: number }> {
  const kept: QueuedWord[] = [];
  let saved = 0;
  let rejected = 0;
  for (const word of state.queue) {
    if (word.userId !== userId) continue;
    const result = await send(word);
    if (result === 'ok') saved += 1;
    else if (result === 'rejected') rejected += 1;
    else kept.push(word);
  }
  return { state: { ...state, queue: kept }, saved, rejected };
}
