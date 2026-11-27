'use client';

import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ExpandedDictionaryEntry } from '../../types';
import Gloss from '../Gloss';
import { usePosLabel } from '../DrawerLabels';

interface Sense {
  partOfSpeech: string;
  gloss: string;
}

/** Consecutive senses with the same part of speech share one heading. */
export function groupByPartOfSpeech(
  senses: Sense[],
): Array<{ partOfSpeech: string; items: Sense[] }> {
  const groups: Array<{ partOfSpeech: string; items: Sense[] }> = [];
  for (const sense of senses) {
    const last = groups[groups.length - 1];
    if (last && last.partOfSpeech === sense.partOfSpeech) last.items.push(sense);
    else groups.push({ partOfSpeech: sense.partOfSpeech, items: [sense] });
  }
  return groups;
}

const KNOWN_TAGS = ['zk', 'gk', 'ky', 'cet4', 'cet6', 'toefl', 'ielts', 'gre'];
const MAINLAND_TAGS = new Set(['zk', 'gk', 'ky', 'cet4', 'cet6']);

const POS_BADGE =
  'inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase';

/** Marks the looked-up word, and its listed forms, inside an example sentence. */
function highlight(sentence: string, forms: Set<string>) {
  return sentence.split(/([A-Za-z]+(?:'[A-Za-z]+)?)/).map((part, i) =>
    forms.has(part.toLowerCase()) ? (
      <strong key={i} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

export function SenseGroups({
  senses,
  onLookupWord,
  inlinePartOfSpeech = false,
}: {
  senses: Sense[];
  onLookupWord?: (word: string) => void;
  inlinePartOfSpeech?: boolean;
}) {
  const posLabel = usePosLabel();
  return (
    <div className="space-y-2.5">
      {groupByPartOfSpeech(senses).map((group, g) => (
        <div key={g}>
          {!inlinePartOfSpeech && group.partOfSpeech && (
            <span className={POS_BADGE}>{posLabel(group.partOfSpeech)}</span>
          )}
          <ol
            className={
              !inlinePartOfSpeech && group.partOfSpeech ? 'mt-1 space-y-1' : 'space-y-1'
            }
          >
            {group.items.map((sense, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex-shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 leading-relaxed text-foreground">
                  {inlinePartOfSpeech && i === 0 && group.partOfSpeech && (
                    <span className={`${POS_BADGE} mr-2 align-baseline whitespace-nowrap`}>
                      {posLabel(group.partOfSpeech)}
                    </span>
                  )}
                  <Gloss text={sense.gloss} onLookupWord={onLookupWord} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** Quiet, single-line metadata strip: frequency rank, Oxford 3000, and exam tags. */
export function EntryBadges({ entry }: { entry: ExpandedDictionaryEntry }) {
  const t = useTranslations('reader.drawer');
  const locale = useLocale();
  const chinese = locale.startsWith('zh');
  const tags = (entry.tags ?? []).filter(
    (tag) => KNOWN_TAGS.includes(tag) && (chinese || !MAINLAND_TAGS.has(tag)),
  );
  if (!entry.collins && !entry.oxford && tags.length === 0 && !entry.rank) return null;

  const metaParts: string[] = [];
  if (entry.oxford) metaParts.push(t('oxford3000'));
  for (const tag of tags.slice(0, 3)) {
    metaParts.push(t(`tags.${tag}`));
  }
  if (entry.rank) {
    metaParts.push(t('frequencyRank', { rank: entry.rank.toLocaleString(locale) }));
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground"
      data-testid="entry-badges"
    >
      {entry.collins ? (
        <span
          className="text-[var(--gold-strong)]"
          title={t('collinsTitle', { stars: entry.collins })}
        >
          {'★'.repeat(entry.collins)}
          <span className="text-muted-foreground/30">{'★'.repeat(5 - entry.collins)}</span>
        </span>
      ) : null}
      {metaParts.length > 0 && <span className="tabular-nums">{metaParts.join(' · ')}</span>}
    </div>
  );
}

/**
 * Bilingual example sentences first (high utility above the fold), followed by
 * English definitions collapsed by default so long dictionary prose never
 * pushes examples out of view.
 */
export function EntryExtras({
  entry,
  word,
  onLookupWord,
  inlinePartOfSpeech,
}: {
  entry: ExpandedDictionaryEntry;
  word: string;
  onLookupWord?: (word: string) => void;
  inlinePartOfSpeech?: boolean;
}) {
  const t = useTranslations('reader.drawer');
  const forms = new Set(
    [word, entry.word, entry.lemmaInfo?.stem, ...(entry.relatedForms ?? []).map((r) => r.form)]
      .filter((form): form is string => Boolean(form))
      .map((form) => form.toLowerCase()),
  );
  const english = entry.englishSenses ?? [];
  const examples = entry.examples ?? [];
  if (english.length === 0 && examples.length === 0) return null;
  return (
    <>
      {examples.length > 0 && (
        <section className="border-b border-border px-4 py-3" data-testid="entry-examples">
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {t('examples')}
          </h3>
          <ul className="space-y-2.5">
            {examples.map((example, i) => (
              <li key={i} className="text-sm leading-relaxed">
                <p className="text-foreground">{highlight(example.text, forms)}</p>
                {example.translation && (
                  <p className="text-muted-foreground">{example.translation}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {english.length > 0 && (
        <section className="border-b border-border px-4 py-2.5" data-testid="entry-english">
          <details key={word} className="group">
            <summary
              className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground select-none hover:text-foreground sm:min-h-8 [&::-webkit-details-marker]:hidden"
              data-testid="entry-english-toggle"
            >
              <ChevronRight
                className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              <span>
                {t('englishDefinitions')} ({english.length})
              </span>
            </summary>
            <div className="mt-2.5 text-sm text-muted-foreground">
              <SenseGroups
                senses={english}
                onLookupWord={onLookupWord}
                inlinePartOfSpeech={inlinePartOfSpeech}
              />
            </div>
          </details>
        </section>
      )}
    </>
  );
}
