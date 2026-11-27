import { SHEET_VH_CLOSE_BELOW } from './sheet-height';

export const NATIVE_SHEET_DEFAULT = 34;
export const NATIVE_SHEET_EXPANDED = 78;
export const MAX_OVERSCROLL = 6;
export type PointerSample = { clientY: number; timeStamp: number };

export function nativeSheetVisualHeight(rawHeight: number): number {
  if (rawHeight <= NATIVE_SHEET_EXPANDED) return Math.max(8, rawHeight);
  const overscroll = Math.log1p((rawHeight - NATIVE_SHEET_EXPANDED) / MAX_OVERSCROLL);
  return NATIVE_SHEET_EXPANDED + (MAX_OVERSCROLL * overscroll) / (1 + overscroll);
}

export function nativeSheetVelocity(samples: PointerSample[]): number {
  const last = samples.at(-1);
  if (!last) return 0;
  const first = samples.find((sample) => last.timeStamp - sample.timeStamp <= 100);
  if (!first || last.timeStamp <= first.timeStamp) return 0;
  return (last.clientY - first.clientY) / (last.timeStamp - first.timeStamp);
}

export function nativeSheetDetent(rawHeight: number, velocity: number): number | 'dismiss' {
  if (rawHeight < SHEET_VH_CLOSE_BELOW || (velocity > 0.65 && rawHeight < NATIVE_SHEET_DEFAULT))
    return 'dismiss';
  if (velocity > 0.45) return NATIVE_SHEET_DEFAULT;
  if (velocity < -0.45) return NATIVE_SHEET_EXPANDED;
  return rawHeight > (NATIVE_SHEET_DEFAULT + NATIVE_SHEET_EXPANDED) / 2
    ? NATIVE_SHEET_EXPANDED
    : NATIVE_SHEET_DEFAULT;
}
