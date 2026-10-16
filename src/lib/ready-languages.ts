/** `null` means every language is ready; otherwise only the listed codes are. */
export function parseReadyLanguages(raw: string): ReadonlySet<string> | null {
  const codes = raw
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
  return codes.length === 0 ? null : new Set(codes);
}

export function isLanguageReady(code: string, ready: ReadonlySet<string> | null): boolean {
  return ready === null || ready.has(code);
}
