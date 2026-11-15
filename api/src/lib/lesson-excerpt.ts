/** Characters of stored text the lesson list reads to build an excerpt. */
export const EXCERPT_SOURCE_CHARS = 600;
const EXCERPT_CHARS = 140;
export function librarySectionNumber(
  title: string,
  opening: string | null,
  source?: { title: string; number: string },
): string | undefined {
  if (!source || title !== source.title || !opening) return;
  const [heading, ...lines] = opening.split(/\r?\n/);
  // The library builder writes a source heading as the first block after the generated H1.
  if (heading === `# ${title}` && !lines.find((line) => line.trim())?.startsWith('## ')) {
    return source.number;
  }
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
