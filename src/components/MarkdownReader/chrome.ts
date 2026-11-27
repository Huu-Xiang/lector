export function readerChromeHidden(scrollTop: number, delta: number, hidden: boolean): boolean {
  if (scrollTop < 32 || delta < -8) return false;
  if (scrollTop > 56 && delta > 12) return true;
  return hidden;
}
