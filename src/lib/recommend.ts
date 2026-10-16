import { CEFR_LEVELS, type CefrLevel } from './reading-level';

export const DEFAULT_RECOMMEND_LEVEL: CefrLevel = 'B1';

function levelIndex(level: string): number {
  return (CEFR_LEVELS as readonly string[]).indexOf(level);
}

/** Exact level first, then one step easier, then one step harder, and so on. */
export function pickNearLevel<T extends { level: string }>(
  items: readonly T[],
  level: CefrLevel | null,
  count: number,
): T[] {
  const target = levelIndex(level ?? DEFAULT_RECOMMEND_LEVEL);
  return items
    .map((item, order) => ({ item, order, index: levelIndex(item.level) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => {
      const da = Math.abs(a.index - target);
      const db = Math.abs(b.index - target);
      if (da !== db) return da - db;
      if (a.index !== b.index) return a.index - b.index;
      return a.order - b.order;
    })
    .slice(0, count)
    .map((entry) => entry.item);
}

/** How far an item sits above the learner's level; zero or less means it fits. */
export function levelGap(itemLevel: string, level: CefrLevel | null): number {
  return levelIndex(itemLevel) - levelIndex(level ?? DEFAULT_RECOMMEND_LEVEL);
}
