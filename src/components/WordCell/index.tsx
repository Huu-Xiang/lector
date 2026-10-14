'use client';

import { useTranslations } from 'next-intl';
import type { WordState } from '@/types';
import { stateClasses } from '@/components/MarkdownReader/theme';

export interface WordCellProps {
  text: string;
  /** Word state from the known-words map; undefined renders as 'new'. */
  state?: WordState;
  /** The currently looked-up word (drawer open) — highlight and underline. */
  isActive?: boolean;
  /** Part of the highlighted phrase selection. */
  isPhraseHighlighted?: boolean;
  /** Tap/Enter/Space. The element is passed so callers can find the sentence context. */
  onActivate?: (text: string, element: HTMLElement) => void;
  /**
   * Pronunciation printed above the word as HTML ruby (#289 4.4) — pinyin for
   * zh, furigana for ja. Omit for no annotation.
   */
  reading?: string;
  /**
   * Draw the reading out of flow rather than letting ruby layout widen the word
   * (`pronunciation.annotationOverhang`). True for a script whose annotation is
   * no wider than the word, false where it is wider and needs the room.
   */
  readingOverhangs?: boolean;
  testId?: string;
}

/**
 * One tappable word with the reader's known/level coloring — extracted from
 * MarkdownReader's ReaderBlock (#185) so listen-along renders segments with
 * the exact same word-state marks instead of flat text. Any surface that
 * shows target-language words with vocab coloring should render these.
 *
 * `data-leaf` marks the span as already-rendered for MarkdownReader's
 * renderChildren walk; it's inert everywhere else.
 */
export default function WordCell({
  text,
  state,
  isActive = false,
  isPhraseHighlighted = false,
  onActivate,
  reading,
  readingOverhangs = false,
  testId = 'reader-word',
}: WordCellProps) {
  const t = useTranslations('reader.wordCell');
  const colorClass = state ? stateClasses[state] : stateClasses.new;
  const isHighlighted = isPhraseHighlighted || isActive;
  // A word with no handler is decoration — the settings preview (#570) draws the
  // chips to show a typography change, and there is nothing to look up. Button
  // semantics there would put five dead stops in the keyboard order and read
  // "Look up X" to a screen reader for a word that is not in the lesson.
  const interactive = onActivate !== undefined;

  return (
    <span
      data-leaf=""
      data-testid={testId}
      // Marks the span as one word: `usePhraseTouchSelection` selects on this
      // attribute, and the e2e suite asserts the state it carries.
      data-word-state={state ?? 'new'}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? t('lookUp', { text }) : undefined}
      onClick={(event) => onActivate?.(text, event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onActivate?.(text, event.currentTarget);
      }}
      data-phrase-highlighted={isPhraseHighlighted || undefined}
      data-active-word={isActive || undefined}
      className={`-mx-[2px] rounded-[4px] px-[2px] ${
        interactive
          ? 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--clay)_12%,transparent)]'
          : ''
      } ${reading && readingOverhangs ? 'relative' : ''} ${
        isHighlighted
          ? 'underline decoration-[var(--clay)] decoration-2 underline-offset-[5px]'
          : colorClass
      }`}
      // The weight is a reader setting. Surfaces outside the reader publish no
      // custom property and use the fallback, which matches DEFAULT_PROSE_STYLE.
      style={{
        fontWeight: 'var(--reader-font-weight, 500)',
        ...(isHighlighted
          ? { backgroundColor: 'color-mix(in srgb, var(--clay) 22%, transparent)' }
          : {}),
      }}
    >
      {reading ? (
        <ruby>
          {text}
          {/* No <rp> fallback: every browser lector supports renders ruby, and
              the extra nodes would double the text every DOM read has to skip. */}
          {/* Two layouts, and which one is right depends on the script. See
              `annotationOverhang`.

              Out of flow (ja): ruby layout widens the BASE to fit the
              annotation, so 勉強 drew as 勉 強 while its neighbours stayed
              tight. Kana is no wider than its kanji, so taking it out of flow
              costs nothing and keeps every word its own width.

              In flow (zh): pinyin IS wider than its hanzi. chángcháng needs more
              room than 常常 has, so out of flow it collided with the word
              beside it. Letting the browser widen the base is correct here.

              0.58em, not the browser default of 0.5: a tone mark or a small
              kana needs the extra pixel at body size. `select-none` is what
              keeps the reading out of a copied selection. */}
          <rt
            className={`text-[0.58em] leading-none font-normal tracking-tight opacity-75 select-none ${
              readingOverhangs
                ? 'absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap'
                : ''
            }`}
          >
            {reading}
          </rt>
        </ruby>
      ) : (
        text
      )}
    </span>
  );
}
