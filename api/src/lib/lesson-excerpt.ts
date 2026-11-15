/** Characters of stored text the lesson list reads to build an excerpt. */
export const EXCERPT_SOURCE_CHARS = 600;
const EXCERPT_CHARS = 140;
const LIBRARY_LESSON_ID = /^library-[a-z]{2,3}-lesson-[a-f0-9]{64}$/;
const NUMBERED_TITLE = /^(\d+)\. (.+)$/;

export function librarySectionNumbers(
  lessons: readonly { id: string; title: string; opening: string | null }[],
): Map<string, string> {
  const byTitle = new Map<string, number>();
  const candidates: Array<{ id: string; number: string; label: string }> = [];
  for (const { id, title, opening } of lessons) {
    if (!LIBRARY_LESSON_ID.test(id)) continue;
    const match = NUMBERED_TITLE.exec(title);
    if (!match) continue;
    const [, number, label] = match;
    byTitle.set(label, (byTitle.get(label) ?? 0) + 1);

    const [heading, ...lines] = opening?.split(/\r?\n/) ?? [];
    // The library builder writes a source heading as the first block after the generated H1.
    if (heading === `# ${title}` && !lines.find((line) => line.trim())?.startsWith('## ')) {
      candidates.push({ id, number, label });
    }
  }
  return new Map(
    candidates
      .filter(({ label }) => (byTitle.get(label) ?? 0) > 1)
      .map(({ id, number }) => [id, number]),
  );
}

/** The opening words of a lesson, without its headings and Markdown marks. */
export function lessonExcerpt(text: string): string {
  const body = text
    .split('\n')
    .filter((line) => !/^\s*#{1,6}\s/.test(line))
    .map((line) => line.replace(/^\s*>+\s?/, ''))
    .join(' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (body.length <= EXCERPT_CHARS) return body;
  const cut = body.slice(0, EXCERPT_CHARS);
  const space = cut.lastIndexOf(' ');
  const kept = space > EXCERPT_CHARS * 0.6 ? cut.slice(0, space) : cut;
  return `${kept.replace(/[\s,;:]+$/, '')}…`;
}
