import { CEFR_LEVELS, type CefrLevel } from './reading-level';

export const VOCAB_RESULT_KEY = 'readfox-vocab-result';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface VocabResult {
  estimate: number;
  level: CefrLevel;
  takenAt: number;
}

export function writeVocabResult(estimate: number, level: CefrLevel, now = Date.now()): void {
  try {
    localStorage.setItem(VOCAB_RESULT_KEY, JSON.stringify({ estimate, level, takenAt: now }));
  } catch {
    /* storage can be blocked; the result still shows on the test page */
  }
}

/** The last test result, or null when it is missing, malformed or older than 30 days. */
export function readVocabResult(now = Date.now()): VocabResult | null {
  try {
    const stored = JSON.parse(localStorage.getItem(VOCAB_RESULT_KEY) ?? 'null') as Partial<
      Record<keyof VocabResult, unknown>
    > | null;
    if (
      !stored ||
      typeof stored.estimate !== 'number' ||
      !Number.isFinite(stored.estimate) ||
      typeof stored.takenAt !== 'number' ||
      typeof stored.level !== 'string' ||
      !(CEFR_LEVELS as readonly string[]).includes(stored.level) ||
      now - stored.takenAt > MAX_AGE_MS
    ) {
      return null;
    }
    return { estimate: stored.estimate, level: stored.level as CefrLevel, takenAt: stored.takenAt };
  } catch {
    return null;
  }
}
