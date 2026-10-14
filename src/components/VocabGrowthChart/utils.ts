export function formatDisplayDate(date: string, locale = 'en'): string {
  return new Date(date).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  });
}
