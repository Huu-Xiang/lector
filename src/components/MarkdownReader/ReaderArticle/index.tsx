'use client';

import {
  Fragment,
  cloneElement,
  createContext,
  isValidElement,
  memo,
  useContext,
  useMemo,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import type { LanguageConfig, WordSegmentation } from '@/lib/languages';
import { foldWord, lookupByVocabKeys, vocabKeys } from '@/lib/languages';
import type { WordState } from '@/types';
import {
  collectWords,
  computePhraseHighlightSetForBlock,
  extractSentenceAtElement,
  phraseHighlightKey,
  phraseHighlightTouchesBlock,
  splitWords,
  type HighlightedPhrase,
} from '../utils';
import { wordReading, type AnnotationMode } from '../annotation';
import { readerWrapClass } from '../wrap';
import { proseStyleVars } from '@/lib/prose-style';
import WordCell from '@/components/WordCell';
import type { ActiveReaderWord, ReaderArticleProps } from './types';

export type { ActiveReaderWord } from './types';

interface TextNode {
  value?: string;
  children?: TextNode[];
}

const nodeText = (node: TextNode): string =>
  (node.value ?? '') + (node.children ?? []).map(nodeText).join('');

/**
 * A link in lesson text stays readable: its words still open the word drawer,
 * and only the small icon after it opens the address in a new tab.
 */
function LessonLink({ href, children }: { href?: string; children: ReactNode }) {
  const t = useTranslations('reader.markdown');
  const external = href && /^https?:\/\//i.test(href) ? href : null;
  return (
    <span
      data-testid="lesson-link"
      className="underline decoration-primary/50 decoration-dotted underline-offset-4"
    >
      {children}
      {external && (
        <a
          href={external}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('openLink')}
          title={external}
          data-testid="lesson-link-open"
          className="relative ml-0.5 inline-flex translate-y-[-0.1em] items-center align-middle text-muted-foreground no-underline select-none before:absolute before:-inset-x-2.5 before:-inset-y-3 hover:text-primary"
        >
          <ExternalLink className="size-[0.8em]" aria-hidden="true" />
        </a>
      )}
    </span>
  );
}

export interface ReaderBlockProps {
  as: 'p' | 'li' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  /** Tailwind classes for the rendered tag; p/li keep their own fixed look. */
  className?: string;
  children: ReactNode;
  blockId: number;
  contentVersion: string;
  pack: LanguageConfig;
  /** The lesson's stored segmentation (#289 4.2); null falls back to ICU. */
  segmentation: WordSegmentation | null;
  knownWordsMap: Map<string, WordState>;
  /**
   * Folded word -> pronunciation, for the ruby layer (#289 4.4). Null when the
   * pack declares no annotation source or the fetch is still in flight.
   *
   * Fetched once per lesson and never patched, so the comparator below can
   * treat it as immutable and compare it by identity.
   */
  readings: Map<string, string> | null;
  annotationMode: AnnotationMode;
  highlightedPhrase: HighlightedPhrase;
  highlightedBlockId?: number | null;
  activeWord: ActiveReaderWord | null;
  onWordClick: (
    word: string,
    sentence: string,
    source?: undefined,
    occurrence?: string,
    options?: { isPhrase?: boolean },
  ) => void;
  onActivateWord: (word: ActiveReaderWord) => void;
  onClearPhrase: () => void;
}

/** Only re-render a body block when its own words or interaction state changed. */
export function readerBlockPropsEqual(previous: ReaderBlockProps, next: ReaderBlockProps): boolean {
  if (
    previous.as !== next.as ||
    previous.className !== next.className ||
    previous.blockId !== next.blockId ||
    previous.contentVersion !== next.contentVersion ||
    previous.pack.code !== next.pack.code ||
    // Identity is enough: MarkdownReader memoizes it on lesson.segmentWords, so
    // a new object means a different segmentation and every span must re-split.
    previous.segmentation !== next.segmentation ||
    // Both must be here. `annotationMode` is what the toggle changes, and
    // nothing else about a block changes with it, so a block left out of this
    // list keeps its old ruby until some unrelated prop moves. `readings` is
    // immutable per lesson, so identity is enough.
    previous.annotationMode !== next.annotationMode ||
    previous.readings !== next.readings ||
    previous.onWordClick !== next.onWordClick ||
    previous.onActivateWord !== next.onActivateWord ||
    previous.onClearPhrase !== next.onClearPhrase
  ) {
    return false;
  }

  const prevTouches = phraseHighlightTouchesBlock(previous.blockId, previous.highlightedPhrase);
  const nextTouches = phraseHighlightTouchesBlock(next.blockId, next.highlightedPhrase);
  if (
    prevTouches !== nextTouches ||
    (nextTouches &&
      phraseHighlightKey(previous.highlightedPhrase) !== phraseHighlightKey(next.highlightedPhrase))
  ) {
    return false;
  }

  const previousActiveIndex =
    previous.activeWord?.blockId === previous.blockId ? previous.activeWord.wordIndex : null;
  const nextActiveIndex =
    next.activeWord?.blockId === next.blockId ? next.activeWord.wordIndex : null;
  if (previousActiveIndex !== nextActiveIndex) return false;

  const previousHighlighted = previous.highlightedBlockId === previous.blockId;
  const nextHighlighted = next.highlightedBlockId === next.blockId;
  if (previousHighlighted !== nextHighlighted) return false;

  if (previous.knownWordsMap === next.knownWordsMap) return true;
  const words = new Set(
    collectWords(previous.children, previous.pack, previous.segmentation).flatMap((word) =>
      vocabKeys(word, previous.pack),
    ),
  );
  for (const word of words) {
    if (previous.knownWordsMap.get(word) !== next.knownWordsMap.get(word)) return false;
  }
  return true;
}

const ReaderBlock = memo(function ReaderBlock({
  as: Tag,
  className,
  children,
  blockId,
  pack,
  segmentation,
  knownWordsMap,
  readings,
  annotationMode,
  highlightedPhrase,
  highlightedBlockId,
  activeWord,
  onWordClick,
  onActivateWord,
  onClearPhrase,
}: ReaderBlockProps) {
  const blockWords = phraseHighlightTouchesBlock(blockId, highlightedPhrase)
    ? collectWords(children, pack, segmentation)
    : [];
  const phraseSet = computePhraseHighlightSetForBlock(
    blockId,
    blockWords.length,
    () => blockWords,
    highlightedPhrase,
    pack,
  );
  // Whether the reading sits out of flow above the word, or in the line box
  // where ruby layout widens the word to fit it. See `annotationOverhang`.
  const overhangs = pack.pronunciation.annotationOverhang;

  const renderChildren = (value: ReactNode, context: { i: number }, keyPrefix = 'r'): ReactNode => {
    if (typeof value === 'string') {
      return splitWords(value, pack, segmentation).map((part, index) => {
        if (!part.isWord) {
          return (
            <span key={`${keyPrefix}-${index}`} data-leaf="">
              {part.text}
            </span>
          );
        }

        const wordIndex = context.i++;
        const key = foldWord(part.text, pack);
        const state = lookupByVocabKeys(knownWordsMap, part.text, pack);
        const isPhraseHighlighted = phraseSet.has(wordIndex);
        const isActiveWord = activeWord?.blockId === blockId && activeWord.wordIndex === wordIndex;

        return (
          <WordCell
            key={`${keyPrefix}-${index}`}
            text={part.text}
            state={state}
            wordIndex={wordIndex}
            isActive={isActiveWord}
            isPhraseHighlighted={isPhraseHighlighted}
            reading={wordReading(annotationMode, readings, key, state)}
            readingOverhangs={overhangs}
            onActivate={(text, element) => {
              onClearPhrase();
              onActivateWord({ blockId, wordIndex });
              onWordClick(
                text,
                extractSentenceAtElement(element, pack),
                undefined,
                `text:${blockId}:${wordIndex}`,
                { isPhrase: false },
              );
            }}
          />
        );
      });
    }

    if (Array.isArray(value)) {
      return value.map((child, index) => (
        <Fragment key={`${keyPrefix}-${index}`}>
          {renderChildren(child, context, `${keyPrefix}-${index}`)}
        </Fragment>
      ));
    }

    if (isValidElement(value)) {
      const element = value as ReactElement<{ children?: ReactNode }>;
      if ((element.props as Record<string, unknown>)['data-leaf'] !== undefined) return element;
      return cloneElement(element, {}, renderChildren(element.props.children, context, keyPrefix));
    }

    return value;
  };

  const content = renderChildren(children, { i: 0 });
  // An annotated paragraph needs headroom for the reading above the word, and
  // how much depends on the layout. Both leadings are resolved once per lesson
  // and published as custom properties by the article below (#570), so a reader
  // who tightens the text tightens the annotated lines with it.
  const annotated = annotationMode !== 'off' && readings !== null;
  const lineHeight = annotated
    ? 'var(--reader-line-height-annotated)'
    : 'var(--reader-line-height)';
  const isConcordanceHighlighted = highlightedBlockId === blockId;
  const blockClassName = isConcordanceHighlighted
    ? `${className ?? ''} -mx-2 rounded-lg bg-[var(--gold-soft)] px-2 py-1 ring-1 ring-[var(--gold-lip)] transition-colors`.trim()
    : className;
  return (
    <Tag
      data-block-id={blockId}
      data-concordance-highlighted={isConcordanceHighlighted || undefined}
      className={blockClassName}
      style={{ lineHeight }}
    >
      {content}
    </Tag>
  );
}, readerBlockPropsEqual);

type ReaderBlockSharedProps = Omit<
  ReaderBlockProps,
  'as' | 'className' | 'children' | 'blockId'
> & {
  title?: string;
};

const ReaderBlockContext = createContext<ReaderBlockSharedProps | null>(null);

const REMARK_PLUGINS = [remarkBreaks];

function createBlockComponent(as: ReaderBlockProps['as'], className?: string) {
  return function ContextualReaderBlock({
    node,
    children,
  }: {
    node?: TextNode & { position?: { start?: { offset?: number } } };
    children?: ReactNode;
  }) {
    const shared = useContext(ReaderBlockContext);
    if (!shared) return null;
    if (
      as === 'h1' &&
      node?.position?.start?.offset === 0 &&
      shared.title &&
      nodeText(node) === shared.title.trim()
    ) {
      return null;
    }
    const { title: _title, ...blockProps } = shared;
    void _title;
    return (
      <ReaderBlock
        as={as}
        className={className}
        blockId={node?.position?.start?.offset ?? 0}
        {...blockProps}
      >
        {children}
      </ReaderBlock>
    );
  };
}

/** Module-level component map so react-markdown keeps stable element types across renders. */
export const READER_MARKDOWN_COMPONENTS: Components = {
  h1: createBlockComponent('h1', 'mt-8 mb-4 font-sans text-3xl font-extrabold first:mt-0'),
  h2: createBlockComponent('h2', 'mt-8 mb-3 font-sans text-2xl font-bold first:mt-0'),
  h3: createBlockComponent('h3', 'mt-6 mb-2 font-sans text-xl font-bold first:mt-0'),
  h4: createBlockComponent('h4', 'mt-5 mb-2 font-sans text-lg font-bold first:mt-0'),
  h5: createBlockComponent('h5', 'mt-5 mb-2 font-sans text-base font-bold first:mt-0'),
  h6: createBlockComponent('h6', 'mt-5 mb-2 font-sans text-sm font-bold uppercase first:mt-0'),
  p: createBlockComponent('p', 'my-5'),
  ul: ({ children }) => <ul className="my-5 list-disc space-y-2 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-5 list-decimal space-y-2 pl-6">{children}</ol>,
  li: createBlockComponent('li'),
  blockquote: ({ children }) => (
    <blockquote className="my-6 border-l-4 border-border pl-4 text-foreground/75 italic">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => <LessonLink href={href}>{children}</LessonLink>,
  hr: () => <hr className="my-8 border-border" />,
};

function ReaderArticle({
  content,
  title,
  pack,
  prose,
  segmentation,
  knownWordsMap,
  readings,
  annotationMode,
  highlightedPhrase,
  highlightedBlockId = null,
  activeWord,
  onWordClick,
  onActivateWord,
  onClearPhrase,
}: ReaderArticleProps) {
  const blockProps = useMemo<ReaderBlockSharedProps>(
    () => ({
      contentVersion: content,
      title,
      pack,
      segmentation,
      knownWordsMap,
      readings,
      annotationMode,
      highlightedPhrase,
      highlightedBlockId,
      activeWord,
      onWordClick,
      onActivateWord,
      onClearPhrase,
    }),
    [
      content,
      title,
      pack,
      segmentation,
      knownWordsMap,
      readings,
      annotationMode,
      highlightedPhrase,
      highlightedBlockId,
      activeWord,
      onWordClick,
      onActivateWord,
      onClearPhrase,
    ],
  );

  const markdownTree = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={READER_MARKDOWN_COMPONENTS}>
        {content}
      </ReactMarkdown>
    ),
    [content],
  );

  const wrapClass = readerWrapClass(pack);

  return (
    <article
      // The lesson's language, not the interface language. Han unification gives
      // one codepoint different glyph shapes per language: 直, 令, 骨 and 花 draw
      // differently under ja and zh-Hans. The document is lang="en", so a
      // browser picked the shapes by its own font order and could draw Japanese
      // text with Chinese forms.
      lang={pack.script.bcp47}
      dir={pack.script.direction}
      className={`reader-text mx-auto max-w-[38em] px-4 py-8 text-foreground sm:px-8 sm:py-16 print:px-0 print:py-0 ${wrapClass}`}
      // The typography reaches the words by inheritance (#570). The blocks below
      // and WordCell read the custom properties, so no component has to pass the
      // resolved style into the memoized block props.
      style={{
        fontFamily: 'var(--font-literata), Georgia, serif',
        fontSize: 'var(--reader-font-size)',
        letterSpacing: 'var(--reader-letter-spacing)',
        ...proseStyleVars(prose, pack),
      }}
    >
      <ReaderBlockContext.Provider value={blockProps}>{markdownTree}</ReaderBlockContext.Provider>
    </article>
  );
}

export default memo(ReaderArticle);
