export const VOCAB_SEEN_KEY = 'readfox-vocab-seen';
/** Oldest words drop out past this many, so the list stays small. */
export const MAX_SEEN = 6000;

function keyFor(language: string): string {
  return language === 'en' ? VOCAB_SEEN_KEY : `${VOCAB_SEEN_KEY}-${language}`;
}

/** Test words asked in earlier tests in this browser, oldest first. */
export function readSeenWords(language = 'en'): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(keyFor(language)) ?? '[]') as unknown;
    return Array.isArray(stored) ? stored.filter((w): w is string => typeof w === 'string') : [];
  } catch {
    return [];
  }
}

export function addSeenWord(word: string, language = 'en'): void {
  try {
    const words = readSeenWords(language).filter((w) => w !== word);
    words.push(word);
    localStorage.setItem(keyFor(language), JSON.stringify(words.slice(-MAX_SEEN)));
  } catch {
    /* storage can be blocked; the next test may then repeat words */
  }
}
