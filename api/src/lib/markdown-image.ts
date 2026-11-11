/** The first `https` image in a markdown text, used as the cover of a saved article. */
export function firstMarkdownImage(markdown: string): string | null {
  const match = /!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/.exec(markdown);
  return match ? match[1] : null;
}
