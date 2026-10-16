import { describe, expect, it } from 'vitest';
import { levelGap, pickNearLevel } from './recommend';

const books = ['A1', 'A2', 'B1', 'B1', 'B2', 'C1', 'C2'].map((level, i) => ({ id: i, level }));

describe('pickNearLevel', () => {
  it('prefers the exact level, then the easier neighbour, then the harder one', () => {
    expect(pickNearLevel(books, 'B1', 4).map((b) => b.id)).toEqual([2, 3, 1, 4]);
  });

  it('defaults to B1 when the learner is not sure', () => {
    expect(pickNearLevel(books, null, 2).map((b) => b.id)).toEqual([2, 3]);
  });

  it('works from the ends of the scale and skips unknown levels', () => {
    expect(pickNearLevel(books, 'A1', 2).map((b) => b.id)).toEqual([0, 1]);
    expect(pickNearLevel([{ level: 'X9' }, { level: 'C2' }], 'C2', 3)).toEqual([{ level: 'C2' }]);
  });
});

describe('levelGap', () => {
  it('counts steps above the learner level', () => {
    expect(levelGap('B1', 'B1')).toBe(0);
    expect(levelGap('C1', 'B1')).toBe(2);
    expect(levelGap('A2', 'B1')).toBe(-1);
    expect(levelGap('B2', null)).toBe(1);
  });
});
