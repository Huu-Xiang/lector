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

/** What a lesson row shows: the excerpt when the title says nothing about the lesson. */
export function lessonHeading(
  lesson: { title: string; excerpt?: string },
  bookTitles: readonly string[],
  lessonCount: number,
): string {
  if (lessonCount > 1 && lesson.excerpt && repeatsBookTitle(lesson.title, bookTitles)) {
    return lesson.excerpt;
  }
  return lesson.title;
}
