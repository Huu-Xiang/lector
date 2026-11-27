import { describe, expect, it } from 'vitest';
import {
  isWordHighlightMode,
  SMART_HINT_CLASS,
  stateClasses,
  wordCellHighlightClass,
} from './theme';

describe('MarkdownReader calm word highlight theme', () => {
  it('validates wordHighlightMode values strictly', () => {
    expect(isWordHighlightMode('saved')).toBe(true);
    expect(isWordHighlightMode('smart')).toBe(true);
    expect(isWordHighlightMode('clean')).toBe(true);
    expect(isWordHighlightMode('underline')).toBe(false);
    expect(isWordHighlightMode(null)).toBe(false);
    expect(isWordHighlightMode(undefined)).toBe(false);
  });

  it('uses soft paper-wash background tint without solid underlines in saved mode', () => {
    for (const state of ['level1', 'level2', 'level3'] as const) {
      const cls = wordCellHighlightClass({ state, mode: 'saved' });
      expect(cls).toBe(stateClasses[state]);
      expect(cls).toContain('bg-[var(--w-wash-');
      expect(cls).not.toContain('underline');
    }
    expect(wordCellHighlightClass({ state: 'level4', mode: 'saved' })).toBe('');
    expect(wordCellHighlightClass({ state: 'new', mode: 'saved' })).toBe('');
    expect(wordCellHighlightClass({ state: 'known', mode: 'saved' })).toBe('');
    expect(wordCellHighlightClass({ state: 'ignored', mode: 'saved' })).toBe('');
    expect(wordCellHighlightClass({ state: undefined, mode: 'saved' })).toBe('');
  });

  it('adds subtle dotted smart-hint only on unseen words in smart mode and clears on known/ignored/level4', () => {
    expect(wordCellHighlightClass({ state: undefined, mode: 'smart', isSmartHint: true })).toBe(
      SMART_HINT_CLASS,
    );
    expect(wordCellHighlightClass({ state: 'new', mode: 'smart', isSmartHint: true })).toBe(
      SMART_HINT_CLASS,
    );
    expect(wordCellHighlightClass({ state: 'new', mode: 'smart', isSmartHint: false })).toBe('');
    // Saved learning words keep their soft warm tint (not double-decorated with dotted line).
    expect(wordCellHighlightClass({ state: 'level1', mode: 'smart', isSmartHint: true })).toBe(
      stateClasses.level1,
    );
    expect(wordCellHighlightClass({ state: 'level2', mode: 'smart', isSmartHint: true })).toBe(
      stateClasses.level2,
    );
    expect(wordCellHighlightClass({ state: 'level3', mode: 'smart', isSmartHint: true })).toBe(
      stateClasses.level3,
    );
    // Marking a word known, ignored, or mastered (level4) clears its smart hint.
    expect(wordCellHighlightClass({ state: 'known', mode: 'smart', isSmartHint: true })).toBe('');
    expect(wordCellHighlightClass({ state: 'ignored', mode: 'smart', isSmartHint: true })).toBe('');
    expect(wordCellHighlightClass({ state: 'level4', mode: 'smart', isSmartHint: true })).toBe('');
  });

  it('renders pure plain text with zero word markings in clean mode', () => {
    for (const state of [
      undefined,
      'new',
      'level1',
      'level2',
      'level3',
      'level4',
      'known',
      'ignored',
    ] as const) {
      expect(wordCellHighlightClass({ state, mode: 'clean', isSmartHint: true })).toBe('');
    }
  });
});
