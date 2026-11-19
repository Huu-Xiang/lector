function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s.。:：,，;；!！?？'’"“”()（）-]+/g, ' ')
    .trim();
}

/** True for a lesson title that only repeats its book's title, such as "3. Gulliver's Travels". */
export function repeatsBookTitle(lessonTitle: string, bookTitles: readonly string[]): boolean {
  const core = plain(lessonTitle.replace(/^\s*\d+\s*[.)、:：-]?\s*/, ''));
  return core !== '' && bookTitles.some((title) => plain(title) === core);
}

export function lessonHeading(
  lesson: { title: string; excerpt?: string; collectionId?: string | null; sectionNumber?: string },
  bookTitles: readonly string[],
  lessonCount: number,
): string {
  if (lessonCount < 2 || !lesson.excerpt) return lesson.title;
  const useExcerpt = lesson.collectionId?.startsWith('library-')
    ? lesson.sectionNumber !== undefined
    : repeatsBookTitle(lesson.title, bookTitles);
  return useExcerpt ? lesson.excerpt : lesson.title;
}
