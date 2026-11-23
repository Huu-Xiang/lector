import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { LANGUAGES } from '@/lib/languages';
import { DEFAULT_PROSE_STYLE } from '@/lib/prose-style';
import ReaderArticle, {
  READER_MARKDOWN_COMPONENTS,
  readerBlockPropsEqual,
  type ReaderBlockProps,
} from './index';

const fr = LANGUAGES.fr;

function makeBlockProps(overrides: Partial<ReaderBlockProps> = {}): ReaderBlockProps {
  return {
    as: 'p',
    className: 'my-5',
    children: 'Bonjour le monde.',
    blockId: 0,
    contentVersion: 'Bonjour le monde.\n\nMerci beaucoup.',
    pack: fr,
    segmentation: null,
    knownWordsMap: new Map(),
    readings: null,
    annotationMode: 'off',
    highlightedPhrase: [],
    activeWord: null,
    onWordClick: vi.fn(),
    onActivateWord: vi.fn(),
    onClearPhrase: vi.fn(),
    ...overrides,
  };
}

describe('ReaderArticle', () => {
  it('renders paragraphs and words via stable module-level markdown components', () => {
    const firstP = READER_MARKDOWN_COMPONENTS.p;
    const html = renderToStaticMarkup(
      <ReaderArticle
        content={'# Titre\n\nBonjour le monde.\n\nMerci beaucoup.'}
        pack={fr}
        prose={DEFAULT_PROSE_STYLE}
        segmentation={null}
        knownWordsMap={new Map([['bonjour', 'known']])}
        readings={null}
        annotationMode="off"
        highlightedPhrase={[]}
        activeWord={{ blockId: 9, wordIndex: 0 }}
        onWordClick={vi.fn()}
        onActivateWord={vi.fn()}
        onClearPhrase={vi.fn()}
      />,
    );

    expect(READER_MARKDOWN_COMPONENTS.p).toBe(firstP);
    expect(html).toContain('<h1');
    expect(html).toContain('Bonjour');
    expect(html).toContain('Merci');
  });

  it('skips re-rendering unaffected blocks when activeWord changes on another block', () => {
    const onWordClick = vi.fn();
    const onActivateWord = vi.fn();
    const onClearPhrase = vi.fn();
    const base = makeBlockProps({
      blockId: 20,
      children: 'Merci beaucoup.',
      activeWord: null,
      onWordClick,
      onActivateWord,
      onClearPhrase,
    });
    const next = makeBlockProps({
      blockId: 20,
      children: 'Merci beaucoup.',
      activeWord: { blockId: 0, wordIndex: 1 },
      onWordClick,
      onActivateWord,
      onClearPhrase,
    });

    expect(readerBlockPropsEqual(base, next)).toBe(true);
  });

  it('skips re-rendering unaffected blocks when knownWordsMap updates only another block', () => {
    const onWordClick = vi.fn();
    const onActivateWord = vi.fn();
    const onClearPhrase = vi.fn();
    const base = makeBlockProps({
      blockId: 20,
      children: 'Merci beaucoup.',
      knownWordsMap: new Map(),
      onWordClick,
      onActivateWord,
      onClearPhrase,
    });
    const next = makeBlockProps({
      blockId: 20,
      children: 'Merci beaucoup.',
      knownWordsMap: new Map([['bonjour', 'known']]),
      onWordClick,
      onActivateWord,
      onClearPhrase,
    });

    expect(readerBlockPropsEqual(base, next)).toBe(true);

    const affected = makeBlockProps({
      blockId: 20,
      children: 'Merci beaucoup.',
      knownWordsMap: new Map([['merci', 'known']]),
      onWordClick,
      onActivateWord,
      onClearPhrase,
    });

    expect(readerBlockPropsEqual(base, affected)).toBe(false);
  });

  it('renders data-block-id on blocks and re-renders only the block whose highlightedBlockId changed', () => {
    const html = renderToStaticMarkup(
      <ReaderArticle
        content={'# Titre\n\nBonjour le monde.\n\nMerci beaucoup.'}
        pack={fr}
        prose={DEFAULT_PROSE_STYLE}
        segmentation={null}
        knownWordsMap={new Map()}
        readings={null}
        annotationMode="off"
        highlightedPhrase={[]}
        highlightedBlockId={9}
        activeWord={null}
        onWordClick={vi.fn()}
        onActivateWord={vi.fn()}
        onClearPhrase={vi.fn()}
      />,
    );

    expect(html).toContain('data-block-id="0"');
    expect(html).toContain('data-block-id="9"');
    expect(html).toContain('data-concordance-highlighted="true"');

    const onWordClick = vi.fn();
    const onActivateWord = vi.fn();
    const onClearPhrase = vi.fn();
    const base = makeBlockProps({
      blockId: 20,
      highlightedBlockId: null,
      onWordClick,
      onActivateWord,
      onClearPhrase,
    });
    const otherBlockHighlighted = makeBlockProps({
      blockId: 20,
      highlightedBlockId: 9,
      onWordClick,
      onActivateWord,
      onClearPhrase,
    });
    const thisBlockHighlighted = makeBlockProps({
      blockId: 20,
      highlightedBlockId: 20,
      onWordClick,
      onActivateWord,
      onClearPhrase,
    });

    expect(readerBlockPropsEqual(base, otherBlockHighlighted)).toBe(true);
    expect(readerBlockPropsEqual(base, thisBlockHighlighted)).toBe(false);
  });
});
