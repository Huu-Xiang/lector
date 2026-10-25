export const SHEET_VH_KEY = 'readfox-sheet-vh';
export const SHEET_VH_DEFAULT = 46;
export const SHEET_VH_MIN = 24;
export const SHEET_VH_MAX = 85;
export const SHEET_VH_CLOSE_BELOW = 16;

export function clampSheetVh(vh: number): number {
  return Math.min(SHEET_VH_MAX, Math.max(SHEET_VH_MIN, vh));
}

export function parseSheetVh(raw: string | null): number | null {
  if (raw === null) return null;
  const vh = Number(raw);
  return Number.isFinite(vh) ? clampSheetVh(vh) : null;
}

export function sheetVhFromPointer(clientY: number, viewportHeight: number): number {
  return ((viewportHeight - clientY) / viewportHeight) * 100;
}

export function readStoredSheetVh(): number | null {
  try {
    return parseSheetVh(localStorage.getItem(SHEET_VH_KEY));
  } catch {
    return null;
  }
}

export function storeSheetVh(vh: number): void {
  try {
    localStorage.setItem(SHEET_VH_KEY, String(Math.round(vh * 10) / 10));
  } catch {}
}

export function applySheetVh(vh: number): void {
  document.documentElement.style.setProperty('--sheet-h', `${vh}dvh`);
}
