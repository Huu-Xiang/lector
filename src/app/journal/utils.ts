// English keeps the day-month order the journal always used.
function intlLocale(locale: string): string {
  return locale === 'en' ? 'en-AU' : locale;
}

export function formatDate(dateStr: string, locale = 'en') {
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  return d.toLocaleDateString(intlLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(isoStr: string, locale = 'en') {
  const d = new Date(isoStr);
  return (
    d.toLocaleDateString(intlLocale(locale), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }) +
    ' ' +
    d.toLocaleTimeString(intlLocale(locale), { hour: '2-digit', minute: '2-digit' })
  );
}
