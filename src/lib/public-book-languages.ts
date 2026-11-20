/** Client-safe list of languages that have public free-library books. */
export const PUBLIC_BOOK_LANGUAGES = ['en', 'fr', 'es', 'zh', 'ko'] as const;
export type PublicBookLanguage = (typeof PUBLIC_BOOK_LANGUAGES)[number];

export function isPublicBookLanguage(
  value: string | null | undefined,
): value is PublicBookLanguage {
  return typeof value === 'string' && (PUBLIC_BOOK_LANGUAGES as readonly string[]).includes(value);
}
