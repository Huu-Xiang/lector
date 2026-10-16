const OVERRIDES: Record<string, Record<string, string>> = {
  grc: { en: 'Ancient Greek (Koine)', 'zh-CN': '古希腊语（新约通用希腊语）' },
};

/** Intl.DisplayNames returns the bare code when it has no name for it. */
export function languageDisplayName(code: string, locale: string, englishName: string): string {
  const override = OVERRIDES[code]?.[locale];
  if (override) return override;
  if (locale === 'en') return OVERRIDES[code]?.en ?? englishName;
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) return name;
  } catch {
    // fall through to the English name
  }
  return OVERRIDES[code]?.en ?? englishName;
}
