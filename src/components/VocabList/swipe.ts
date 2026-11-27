export const SWIPE_ACTION_WIDTH = 152;

export function swipeDirection(deltaX: number, deltaY: number) {
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) <= 10) return null;
  return Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
}

export function swipeOffset(initialOffset: number, deltaX: number) {
  return Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, initialOffset + deltaX));
}

export function swipeStaysOpen(offset: number) {
  return offset < -SWIPE_ACTION_WIDTH / 3;
}
