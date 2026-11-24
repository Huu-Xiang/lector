const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export function isNoIndexSite(): boolean {
  return process.env.READFOX_BETA_NOTICE === '1' || process.env.READFOX_NOINDEX === '1';
}

export function validIndexNowKey(
  raw: string | undefined = process.env.INDEXNOW_KEY,
): string | null {
  const key = raw?.trim() ?? '';
  return INDEXNOW_KEY_PATTERN.test(key) ? key : null;
}

export function siteLastModified(): Date {
  const raw = process.env.NEXT_PUBLIC_BUILD_TIME;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date('2026-11-24T00:00:00Z');
}
