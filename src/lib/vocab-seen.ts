export const VOCAB_SEEN_KEY = 'readfox-vocab-seen';
/** Oldest words drop out past this many, so the list stays small. */
export const MAX_SEEN = 6000;

/** Test words asked in earlier tests in this browser, oldest first. */
export function readSeenWords(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(VOCAB_SEEN_KEY) ?? '[]') as unknown;
    return Array.isArray(stored) ? stored.filter((w): w is string => typeof w === 'string') : [];
  } catch {
    return [];
  }
}

export function addSeenWord(word: string): void {
  try {
    const words = readSeenWords().filter((w) => w !== word);
    words.push(word);
    localStorage.setItem(VOCAB_SEEN_KEY, JSON.stringify(words.slice(-MAX_SEEN)));
  } catch {
    /* storage can be blocked; the next test may then repeat words */
  }
}
