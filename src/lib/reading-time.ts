/** Rough reading time at 200 words a minute; Chinese counts characters, read at 400 a minute. */
export function readingMinutes(wordCount: number, language: string): number {
  const perMinute = language === 'zh' ? 400 : 200;
  return Math.max(1, Math.round(wordCount / perMinute));
}
