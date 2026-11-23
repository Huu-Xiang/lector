import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '@/lib/languages';
import {
  buildConcordanceJumpHref,
  CONCORDANCE_JUMP_STORAGE_KEY,
  consumeConcordanceJump,
  findMatchingBlockId,
  parseValidatedSegmentParam,
  readableBlockText,
  stashConcordanceJump,
} from './concordance-jump';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function textNode(value: string) {
  return { nodeType: 3, textContent: value } as unknown as Node;
}

function elNode(tagName: string, children: Node[] = []) {
  return { nodeType: 1, tagName, childNodes: children } as unknown as Node;
}

describe('concordance-jump', () => {
  it('builds safe jump URLs with no raw sentence or query text leaked', () => {
    expect(buildConcordanceJumpHref('lesson/a b')).toBe('/read/lesson%2Fa%20b?jump=1');
    expect(buildConcordanceJumpHref('yt-1', 4)).toBe('/read/yt-1?jump=1&segment=4');
    expect(buildConcordanceJumpHref('yt-1', -1)).toBe('/read/yt-1?jump=1');
  });

  it('strictly validates integer segment query parameters against /^\\d+$/', () => {
    expect(parseValidatedSegmentParam('0')).toBe(0);
    expect(parseValidatedSegmentParam('42')).toBe(42);
    expect(parseValidatedSegmentParam('')).toBeNull();
    expect(parseValidatedSegmentParam('-1')).toBeNull();
    expect(parseValidatedSegmentParam('1.5')).toBeNull();
    expect(parseValidatedSegmentParam('12abc')).toBeNull();
    expect(parseValidatedSegmentParam('NaN')).toBeNull();
    expect(parseValidatedSegmentParam(null)).toBeNull();
  });

  it('hands off jump payload through sessionStorage once and rejects mismatched lessons', () => {
    const storage = new MemoryStorage();
    stashConcordanceJump(
      {
        lessonId: 'lesson-a',
        q: 'häuser',
        sentence: 'Alte Häuser stehen am Fluss.',
        occ: 1,
      },
      storage,
    );

    // Unrelated lesson does not consume or receive lesson-a's jump payload.
    expect(consumeConcordanceJump('lesson-b', '?jump=1', storage)).toBeNull();
    expect(storage.getItem(CONCORDANCE_JUMP_STORAGE_KEY)).not.toBeNull();

    // Matching lesson consumes the payload once.
    expect(consumeConcordanceJump('lesson-a', '?jump=1', storage)).toEqual({
      lessonId: 'lesson-a',
      q: 'häuser',
      sentence: 'Alte Häuser stehen am Fluss.',
      occ: 1,
    });
    expect(storage.getItem(CONCORDANCE_JUMP_STORAGE_KEY)).toBeNull();
    expect(consumeConcordanceJump('lesson-a', '?jump=1', storage)).toBeNull();
  });

  it('accepts validated ?segment=<int> even without sessionStorage and ignores invalid ?segment', () => {
    const storage = new MemoryStorage();
    expect(consumeConcordanceJump('yt-1', '?jump=1&segment=7', storage)).toEqual({
      lessonId: 'yt-1',
      q: '',
      sentence: '',
      occ: 0,
      segmentIndex: 7,
    });
    expect(consumeConcordanceJump('yt-1', '?jump=1&segment=notanint', storage)).toBeNull();
  });

  it('normalizes block DOM text by treating <br> as a space and skipping <rt>/<rp>/<button>', () => {
    const p = elNode('P', [
      elNode('SPAN', [textNode('Alte')]),
      textNode(' '),
      elNode('RUBY', [textNode('Häuser'), elNode('RT', [textNode('noise')])]),
      elNode('BR'),
      elNode('SPAN', [textNode('stehen am Fluss.')]),
      elNode('BUTTON', [textNode('0:12')]),
    ]);
    expect(readableBlockText(p)).toBe('Alte Häuser stehen am Fluss.');
  });

  it('resolves exact target block by normalized sentence needle, occ index, and windowed ellipses', () => {
    const blocks = [
      { blockId: 0, text: 'Häuser' },
      { blockId: 10, text: 'Alte Häuser stehen am Fluss.' },
      { blockId: 40, text: 'Alte Häuser stehen am Fluss.' },
      { blockId: 80, text: 'Sehr viele bunte Häuser stehen direkt neben dem alten Marktplatz.' },
    ];

    expect(
      findMatchingBlockId(
        blocks,
        { sentence: 'Häuser', q: 'häuser', occ: 0 },
        LANGUAGES.de,
      ),
    ).toBe(0);
    expect(
      findMatchingBlockId(
        blocks,
        { sentence: 'Alte Häuser stehen am Fluss.', q: 'häuser', occ: 0 },
        LANGUAGES.de,
      ),
    ).toBe(10);
    expect(
      findMatchingBlockId(
        blocks,
        { sentence: 'Alte Häuser stehen am Fluss.', q: 'häuser', occ: 1 },
        LANGUAGES.de,
      ),
    ).toBe(40);
    expect(
      findMatchingBlockId(
        blocks,
        { sentence: '…bunte Häuser stehen direkt…', q: 'häuser', occ: 0 },
        LANGUAGES.de,
      ),
    ).toBe(80);
  });

  it('does not jump to an earlier block whose longer sentence contains the shorter target sentence as a substring (B3)', () => {
    const blocks = [
      { blockId: 0, text: 'A visitor said the harbor is busy.' },
      { blockId: 36, text: 'The harbor is busy.' },
    ];
    expect(
      findMatchingBlockId(
        blocks,
        { sentence: 'A visitor said the harbor is busy.', q: 'harbor', occ: 0 },
        LANGUAGES.en,
      ),
    ).toBe(0);
    expect(
      findMatchingBlockId(
        blocks,
        { sentence: 'The harbor is busy.', q: 'harbor', occ: 0 },
        LANGUAGES.en,
      ),
    ).toBe(36);
  });

  it('excludes nested [data-block-id] descendants so loose lists, blockquotes, and tight nested lists do not double-count occ (B3 R2)', () => {
    const mkText = (textContent: string): Node => ({ nodeType: 3, textContent }) as unknown as Node;
    const mkEl = (tagName: string, blockId: number | null, childNodes: Node[]): Node =>
      ({
        nodeType: 1,
        tagName,
        childNodes,
        hasAttribute: (name: string) => name === 'data-block-id' && blockId !== null,
        getAttribute: (name: string) =>
          name === 'data-block-id' && blockId !== null ? String(blockId) : null,
      }) as unknown as Node;

    // Loose list + final paragraph:
    //   - The harbor is busy.
    //
    //     Another sentence.
    //
    //   The harbor is busy.
    const innerP1 = mkEl('P', 2, [mkText('The harbor is busy.')]);
    const innerP2 = mkEl('P', 25, [mkText('Another sentence.')]);
    const outerLi = mkEl('LI', 0, [innerP1, innerP2]);
    const finalP = mkEl('P', 46, [mkText('The harbor is busy.')]);

    // Simulate querySelectorAll('[data-block-id]') order: outer <li>, <p#2>, <p#25>, <p#46>.
    const looseNodes = [
      { id: 0, node: outerLi },
      { id: 2, node: innerP1 },
      { id: 25, node: innerP2 },
      { id: 46, node: finalP },
    ];
    expect(readableBlockText(outerLi)).toBe('');
    expect(readableBlockText(innerP1)).toBe('The harbor is busy.');
    const looseBlocks = looseNodes
      .map(({ id, node }) => ({ blockId: id, text: readableBlockText(node) }))
      .filter((b) => b.text.length > 0);
    expect(
      findMatchingBlockId(
        looseBlocks,
        { sentence: 'The harbor is busy.', q: 'harbor', occ: 0 },
        LANGUAGES.en,
      ),
    ).toBe(2);
    expect(
      findMatchingBlockId(
        looseBlocks,
        { sentence: 'The harbor is busy.', q: 'harbor', occ: 1 },
        LANGUAGES.en,
      ),
    ).toBe(46);

    // Tight nested list: parent <li> retains its own direct text without swallowing child <li>.
    const nestedChildLi = mkEl('LI', 24, [mkText('Nested harbor.')]);
    const nestedUl = mkEl('UL', null, [nestedChildLi]);
    const tightParentLi = mkEl('LI', 0, [mkText('Parent harbor.'), nestedUl]);
    expect(readableBlockText(tightParentLi)).toBe('Parent harbor.');
    expect(readableBlockText(nestedChildLi)).toBe('Nested harbor.');
  });
});
