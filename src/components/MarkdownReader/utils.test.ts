import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import {
  splitWords,
  collectWords,
  computePhraseHighlightSet,
  computePhraseHighlightSetForBlock,
  extractSentenceAtElement,
  findSelectionAnchorElement,
  parseSegmentWords,
  phraseHighlightTouchesBlock,
  readableRangeText,
  readableText,
  snapToWordBoundaries,
  stripEdgePunctuation,
  wordSpansBetween,
} from './utils';
import { LANGUAGES } from '@/lib/languages';

const af = LANGUAGES.af;
const de = LANGUAGES.de;
const en = LANGUAGES.en;
const ja = LANGUAGES.ja;
const zh = LANGUAGES.zh;

const words = (text: string, pack = af) =>
  splitWords(text, pack)
    .filter((p) => p.isWord)
    .map((p) => p.text);

describe('splitWords', () => {
  it('extracts words and leaves punctuation/whitespace as non-word parts', () => {
    expect(words('Die son sak agter die berge.')).toEqual([
      'Die',
      'son',
      'sak',
      'agter',
      'die',
      'berge',
    ]);
  });

  it('is lossless — joining all parts reconstructs the input', () => {
    const input = 'Sy dink: "wat nou?" en stap weg.';
    expect(
      splitWords(input, af)
        .map((p) => p.text)
        .join(''),
    ).toBe(input);
  });

  it('keeps hyphenated and accented words whole', () => {
    expect(words('Reen bring verligting vir die Wes-Kaap')).toContain('Wes-Kaap');
    expect(words('more is donker en moeilik')).toEqual(['more', 'is', 'donker', 'en', 'moeilik']);
  });

  it('treats the Afrikaans n-article as one word across apostrophe variants', () => {
    // straight ', curly (U+2018 / U+2019 — what the EPUB/HTML importer emits),
    // and modifier (U+02BC) all count as the n-article's apostrophe.
    for (const code of [0x27, 0x2018, 0x2019, 0x02bc]) {
      const apos = String.fromCharCode(code);
      expect(words(`${apos}n hond`)).toEqual([`${apos}n`, 'hond']);
    }
  });

  it('keeps German words with umlauts and ß whole (issue #203 §7d)', () => {
    // Before the À-ÖØ-öø-ž charset fix these shattered: Häuser→H+user, Straßen→Stra+en.
    expect(words('Die Häuser sind schöner geworden', de)).toEqual([
      'Die',
      'Häuser',
      'sind',
      'schöner',
      'geworden',
    ]);
    expect(words('Kinder gingen durch die Straßen', de)).toContain('Straßen');
    // Capitalised umlaut-initial German nouns stay whole.
    expect(words('Ärzte essen Öl', de)).toEqual(['Ärzte', 'essen', 'Öl']);
  });
});

describe('collectWords', () => {
  it('flattens words across strings and inline elements in document order', () => {
    // "die son is **baie mooi** vandag" as react-markdown would pass it
    const children = ['die son is ', createElement('strong', { key: 's' }, 'baie mooi'), ' vandag'];
    expect(collectWords(children, af)).toEqual(['die', 'son', 'is', 'baie', 'mooi', 'vandag']);
  });

  it('recurses into nested inline elements', () => {
    const children = createElement('em', null, 'sag ', createElement('strong', null, 'wind'));
    expect(collectWords(children, af)).toEqual(['sag', 'wind']);
  });

  it('ignores non-text leaves', () => {
    expect(collectWords([null, false, undefined, 123, 'hond'], af)).toEqual(['hond']);
  });
});

describe('computePhraseHighlightSet', () => {
  const block = ['die', 'son', 'sak', 'die', 'bloue', 'berge'];

  it('marks the first contiguous run of the phrase', () => {
    expect([...computePhraseHighlightSet(block, ['sak', 'die'], af)]).toEqual([2, 3]);
  });

  it('is case-insensitive', () => {
    expect([...computePhraseHighlightSet(['Die', 'Son'], ['die', 'son'], af)]).toEqual([0, 1]);
  });

  it('returns empty for no match, empty phrase, or over-long phrase', () => {
    expect(computePhraseHighlightSet(block, ['kat'], af).size).toBe(0);
    expect(computePhraseHighlightSet(block, [], af).size).toBe(0);
    expect(computePhraseHighlightSet(['een'], ['een', 'twee'], af).size).toBe(0);
  });
});

describe('parseSegmentWords (#289 4.2)', () => {
  it('reads a stored list', () => {
    expect(parseSegmentWords('["喜欢","读书"]')).toEqual(['喜欢', '读书']);
  });

  it('treats absent, empty and blank as no segmentation', () => {
    expect(parseSegmentWords(null)).toBeNull();
    expect(parseSegmentWords(undefined)).toBeNull();
    expect(parseSegmentWords('')).toBeNull();
    expect(parseSegmentWords('[]')).toBeNull();
  });

  it('degrades to null on malformed input rather than throwing', () => {
    // The reader can always fall back to Intl.Segmenter, so one bad row must
    // never blank the page.
    expect(parseSegmentWords('{not json')).toBeNull();
    expect(parseSegmentWords('{"a":1}')).toBeNull();
    expect(parseSegmentWords('"a string"')).toBeNull();
  });

  it('drops non-string entries instead of rejecting the whole list', () => {
    expect(parseSegmentWords('["喜欢",7,null,"读书"]')).toEqual(['喜欢', '读书']);
  });
});

describe('readableText (#289 4.4)', () => {
  // The vitest environment is 'node', so these are DOM-shaped stubs exercising
  // the walk itself. Real browser behaviour is covered in e2e: with a live
  // <ruby>, `textContent` gives "我wǒ喜欢xǐhuan" where this returns "我喜欢".
  const text = (value: string): Node => ({ nodeType: 3, textContent: value }) as unknown as Node;
  const el = (tagName: string, ...children: Node[]): Node =>
    ({ nodeType: 1, tagName, childNodes: children }) as unknown as Node;
  const ruby = (base: string, reading: string) => el('RUBY', text(base), el('RT', text(reading)));

  it('skips the reading and keeps the base text', () => {
    expect(readableText(ruby('喜欢', 'xǐhuan'))).toBe('喜欢');
  });

  it('reassembles a whole block without any annotation', () => {
    const block = el(
      'P',
      el('SPAN', ruby('我', 'wǒ')),
      el('SPAN', ruby('喜欢', 'xǐhuan')),
      el('SPAN', ruby('读书', 'dúshū')),
      el('SPAN', text('。')),
    );
    expect(readableText(block)).toBe('我喜欢读书。');
  });

  it('skips <rp> too, which is the non-ruby fallback parenthesis', () => {
    const withFallback = el(
      'RUBY',
      text('日本語'),
      el('RP', text('(')),
      el('RT', text('にほんご')),
      el('RP', text(')')),
    );
    expect(readableText(withFallback)).toBe('日本語');
  });

  it('leaves un-annotated markup untouched, including nested inline elements', () => {
    const block = el('P', text('Die '), el('STRONG', text('groot')), text(' hond.'));
    expect(readableText(block)).toBe('Die groot hond.');
  });

  it('returns a bare text node as itself', () => {
    expect(readableText(text('hallo'))).toBe('hallo');
  });

  it('returns empty for an annotation asked about directly', () => {
    expect(readableText(el('RT', text('wǒ')))).toBe('');
  });

  it('skips <button> elements including timestamp chrome', () => {
    expect(readableText(el('BUTTON', text('0:03')))).toBe('');
    const segment = el(
      'DIV',
      el('BUTTON', el('SVG'), text('0:03')),
      el('P', el('SPAN', text('good')), el('SPAN', text(' ')), el('SPAN', text('morning'))),
    );
    expect(readableText(segment)).toBe('good morning');
  });

  it('separates adjacent cloned block elements with a single space for spaced scripts (AE1)', () => {
    const fragment = {
      nodeType: 11,
      childNodes: [
        el('DIV', el('P', el('SPAN', text('world')))),
        el('DIV', el('BUTTON', el('SVG'), text('0:03')), el('P', el('SPAN', text('good')))),
      ],
    } as unknown as DocumentFragment;
    const range = { cloneContents: () => fragment } as unknown as Range;

    expect(readableRangeText(range)).toBe('world good');
    expect(readableRangeText(range, true)).toBe('world good');
  });

  it('joins adjacent cues without inserting spaces for unspaced CJK scripts', () => {
    const zhFragment = {
      nodeType: 11,
      childNodes: [
        el('DIV', el('P', el('SPAN', text('世界')))),
        el('DIV', el('BUTTON', text('0:03')), el('P', el('SPAN', text('早安')))),
      ],
    } as unknown as DocumentFragment;
    const zhRange = { cloneContents: () => zhFragment } as unknown as Range;

    expect(readableRangeText(zhRange, false)).toBe('世界早安');

    const jaFragment = {
      nodeType: 11,
      childNodes: [
        el('DIV', el('P', el('SPAN', ruby('世界', 'せかい')))),
        el('DIV', el('BUTTON', text('0:03')), el('P', el('SPAN', text('おはよう')))),
      ],
    } as unknown as DocumentFragment;
    const jaRange = { cloneContents: () => jaFragment } as unknown as Range;

    expect(readableRangeText(jaRange, false)).toBe('世界おはよう');
  });

  it('separates markdown block elements without duplicating existing edge spaces', () => {
    const fragment = {
      nodeType: 11,
      childNodes: [
        el('H2', text('Title')),
        el('P', text('First ')),
        el('BLOCKQUOTE', el('P', text('second'))),
        el('LI', text(' third')),
      ],
    } as unknown as DocumentFragment;

    expect(readableText(fragment, true)).toBe('Title First second third');
    expect(readableText(fragment, false)).toBe('TitleFirst second third');
  });
});

describe('snapToWordBoundaries', () => {
  const textNode = (value: string): Node =>
    ({ nodeType: 3, textContent: value }) as unknown as Node;
  const el = (tagName: string, ...children: Node[]): Node =>
    ({ nodeType: 1, tagName, childNodes: children }) as unknown as Node;

  it('snaps a cross-cue English drag, skips timestamp buttons, and preserves single-space separation (AE1)', () => {
    const startText = textNode('world');
    const endText = textNode('good');
    let startOffset = 2;
    let endOffset = 2;

    const range = {
      startContainer: startText,
      get startOffset() {
        return startOffset;
      },
      endContainer: endText,
      get endOffset() {
        return endOffset;
      },
      setStart: (_node: Node, offset: number) => {
        startOffset = offset;
      },
      setEnd: (_node: Node, offset: number) => {
        endOffset = offset;
      },
      cloneContents: () =>
        ({
          nodeType: 11,
          childNodes: [
            el(
              'DIV',
              el('P', el('SPAN', textNode((startText.textContent ?? '').slice(startOffset)))),
            ),
            el(
              'DIV',
              el('BUTTON', textNode('0:03')),
              el('P', el('SPAN', textNode('  ' + (endText.textContent ?? '').slice(0, endOffset)))),
            ),
          ],
        }) as unknown as DocumentFragment,
    } as unknown as Range;

    const selection = { getRangeAt: () => range } as unknown as Selection;

    expect(snapToWordBoundaries(selection, en)).toBe('world good');
    expect(startOffset).toBe(0);
    expect(endOffset).toBe(4);
  });

  it('snaps a cross-cue unspaced CJK drag without inserting spaces between cues', () => {
    const startText = textNode('世界');
    const endText = textNode('早安');
    let startOffset = 1;
    let endOffset = 1;

    const range = {
      startContainer: startText,
      get startOffset() {
        return startOffset;
      },
      endContainer: endText,
      get endOffset() {
        return endOffset;
      },
      setStart: (_node: Node, offset: number) => {
        startOffset = offset;
      },
      setEnd: (_node: Node, offset: number) => {
        endOffset = offset;
      },
      cloneContents: () =>
        ({
          nodeType: 11,
          childNodes: [
            el(
              'DIV',
              el('P', el('SPAN', textNode((startText.textContent ?? '').slice(startOffset)))),
            ),
            el(
              'DIV',
              el('BUTTON', textNode('0:03')),
              el('P', el('SPAN', textNode((endText.textContent ?? '').slice(0, endOffset)))),
            ),
          ],
        }) as unknown as DocumentFragment,
    } as unknown as Range;

    const selection = { getRangeAt: () => range } as unknown as Selection;

    expect(snapToWordBoundaries(selection, zh)).toBe('世界早安');
    expect(snapToWordBoundaries(selection, ja)).toBe('世界早安');
  });
});

describe('findSelectionAnchorElement', () => {
  type StubEl = HTMLElement & {
    _closest?: HTMLElement | null;
    _blocks?: HTMLElement[];
  };

  const makeEl = (
    tagName: string,
    opts: { closest?: HTMLElement | null; blocks?: HTMLElement[] } = {},
  ): StubEl => {
    const node = {
      nodeType: 1,
      tagName,
      closest: () => opts.closest ?? null,
      querySelectorAll: () => opts.blocks ?? [],
    } as unknown as StubEl;
    return node;
  };

  const makeText = (parentElement: HTMLElement | null): Node =>
    ({ nodeType: 3, parentElement }) as unknown as Node;

  it('keeps the anchor word element when the anchor lies inside a paragraph', () => {
    const p0 = makeEl('P');
    p0.closest = () => p0;
    const span = makeEl('SPAN', { closest: p0 });
    const text = makeText(span);
    const range = {
      startContainer: text,
      endContainer: text,
      commonAncestorContainer: p0,
      intersectsNode: () => true,
    } as unknown as Range;
    const selection = { anchorNode: text } as unknown as Selection;

    expect(findSelectionAnchorElement(selection, range)).toBe(span);
  });

  it('keeps a <p> element when anchorNode is the paragraph node itself', () => {
    const p0 = makeEl('P');
    p0.closest = () => p0;
    const range = {
      startContainer: p0,
      endContainer: p0,
      commonAncestorContainer: p0,
      intersectsNode: () => true,
    } as unknown as Range;
    const selection = { anchorNode: p0 } as unknown as Selection;

    expect(findSelectionAnchorElement(selection, range)).toBe(p0);
  });

  it('falls back to the first intersected <p> when anchor lands on a segment container or button', () => {
    const p0 = makeEl('P');
    p0.closest = () => p0;
    const p1 = makeEl('P');
    p1.closest = () => p1;
    const seg0 = makeEl('DIV');
    const btn1 = makeEl('BUTTON');
    const reader = makeEl('DIV', { blocks: [p0, p1] });
    const btnText = makeText(btn1);

    // Drag starts on segment container (outside <p>) across p0 into p1.
    const fromContainerRange = {
      startContainer: seg0,
      endContainer: makeText(makeEl('SPAN', { closest: p1 })),
      commonAncestorContainer: reader,
      intersectsNode: (node: Node) => node === p0 || node === p1,
    } as unknown as Range;
    expect(
      findSelectionAnchorElement({ anchorNode: seg0 } as unknown as Selection, fromContainerRange),
    ).toBe(p0);

    // Drag starts on cue 1 timestamp button and enters cue 1's <p>.
    const fromButtonRange = {
      startContainer: btnText,
      endContainer: makeText(makeEl('SPAN', { closest: p1 })),
      commonAncestorContainer: reader,
      intersectsNode: (node: Node) => node === p1,
    } as unknown as Range;
    expect(
      findSelectionAnchorElement({ anchorNode: btnText } as unknown as Selection, fromButtonRange),
    ).toBe(p1);
  });
});

describe('wordSpansBetween', () => {
  const spans = ['die', 'groot', 'hond', 'loop'];

  it('returns the inclusive run for a forward drag', () => {
    expect(wordSpansBetween('die', 'hond', spans)).toEqual(['die', 'groot', 'hond']);
  });

  it('returns the same run for a backward drag', () => {
    expect(wordSpansBetween('hond', 'die', spans)).toEqual(['die', 'groot', 'hond']);
  });

  it('returns the single word when both endpoints are the same', () => {
    expect(wordSpansBetween('groot', 'groot', spans)).toEqual(['groot']);
  });

  it('returns nothing when an endpoint is not in the list', () => {
    expect(wordSpansBetween('die', 'kat', spans)).toEqual([]);
    expect(wordSpansBetween('kat', 'die', spans)).toEqual([]);
  });
});

describe('stripEdgePunctuation & edge-offset snapToWordBoundaries', () => {
  it('strips leading and trailing punctuation while preserving apostrophes inside words', () => {
    expect(stripEdgePunctuation('«l’homme»,')).toBe('l’homme');
    expect(stripEdgePunctuation('「日本語」。')).toBe('日本語');
    expect(stripEdgePunctuation('  (hello world!)  ')).toBe('hello world');
  });

  it('does not swallow the next word when endOffset is 0 or the previous word when startOffset is at text end', () => {
    const w1 = { nodeType: 3, textContent: 'bonjour', parentElement: null } as unknown as Text;
    const w2 = { nodeType: 3, textContent: 'monde', parentElement: null } as unknown as Text;

    let setStartOffset: number | null = null;
    let setEndOffset: number | null = null;
    const edgeRange = {
      startContainer: w1,
      startOffset: w1.textContent!.length,
      endContainer: w2,
      endOffset: 0,
      setStart: (_node: Node, off: number) => {
        setStartOffset = off;
      },
      setEnd: (_node: Node, off: number) => {
        setEndOffset = off;
      },
      cloneContents: () => ({ nodeType: 11, childNodes: [] }),
    } as unknown as Range;
    const edgeSelection = { getRangeAt: () => edgeRange } as unknown as Selection;
    snapToWordBoundaries(edgeSelection, af);
    expect(setStartOffset).toBeNull();
    expect(setEndOffset).toBeNull();

    // Range starting mid-word in w1 and ending mid-word in w2 snaps both boundaries.
    const midRange = {
      startContainer: w1,
      startOffset: 2,
      endContainer: w2,
      endOffset: 3,
      setStart: (_node: Node, off: number) => {
        setStartOffset = off;
      },
      setEnd: (_node: Node, off: number) => {
        setEndOffset = off;
      },
      cloneContents: () => ({ nodeType: 11, childNodes: [w1, w2] }),
    } as unknown as Range;
    const midSelection = { getRangeAt: () => midRange } as unknown as Selection;
    snapToWordBoundaries(midSelection, af);
    expect(setStartOffset).toBe(0);
    expect(setEndOffset).toBe(5);
  });
});

describe('coordinate-scoped phrase highlight', () => {
  it('highlights only the selected block and exact word indices, ignoring duplicate words elsewhere', () => {
    const blockWords = ['die', 'kat', 'sien', 'die', 'kat'];
    const highlight = {
      words: ['die', 'kat'],
      coords: { startBlockId: 42, startWordIndex: 3, endBlockId: 42, endWordIndex: 4 },
    };
    expect(phraseHighlightTouchesBlock(42, highlight)).toBe(true);
    expect(phraseHighlightTouchesBlock(7, highlight)).toBe(false);
    expect([
      ...computePhraseHighlightSetForBlock(42, blockWords.length, () => blockWords, highlight, af),
    ]).toEqual([3, 4]);
    expect([
      ...computePhraseHighlightSetForBlock(7, blockWords.length, () => blockWords, highlight, af),
    ]).toEqual([]);
  });
});

describe('extractSentenceAtElement', () => {
  it('extracts the exact sentence containing a duplicate or substring word using DOM offset', () => {
    const block = {
      nodeType: 1,
      tagName: 'P',
      childNodes: [] as Node[],
    } as unknown as HTMLElement;
    const mkSpan = (txt: string) => {
      const t = { nodeType: 3, textContent: txt } as unknown as Node;
      return {
        nodeType: 1,
        tagName: 'SPAN',
        childNodes: [t],
        closest: () => block,
      } as unknown as HTMLElement;
    };
    const s1 = mkSpan('Dieselfde ');
    const s2 = mkSpan('dag ');
    const s3 = mkSpan('was ');
    const s4 = mkSpan('mooi. ');
    const s5 = mkSpan('Die ');
    const s6 = mkSpan('son ');
    const s7 = mkSpan('skyn.');
    (block as unknown as { childNodes: Node[] }).childNodes = [s1, s2, s3, s4, s5, s6, s7];

    // Clicking "Die" in the second sentence must NOT match "Die" inside "Dieselfde" in sentence 1!
    expect(extractSentenceAtElement(s5, af)).toBe('Die son skyn.');
    expect(extractSentenceAtElement(s2, af)).toBe('Dieselfde dag was mooi.');
  });
});
