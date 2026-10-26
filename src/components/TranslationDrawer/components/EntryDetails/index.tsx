'use client';

import { useTranslations } from 'next-intl';
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
}: {
  senses: Sense[];
  onLookupWord?: (word: string) => void;
}) {
  const posLabel = usePosLabel();
  return (
    <div className="space-y-3">
      {groupByPartOfSpeech(senses).map((group, g) => (
        <div key={g}>
          {group.partOfSpeech && <span className={POS_BADGE}>{posLabel(group.partOfSpeech)}</span>}
          <ol className={group.partOfSpeech ? 'mt-1.5 space-y-1.5' : 'space-y-1.5'}>
            {group.items.map((sense, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex-shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 leading-relaxed text-foreground">
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

/** Frequency, exam tags, Collins stars and the Oxford 3000 mark. */
export function EntryBadges({ entry }: { entry: ExpandedDictionaryEntry }) {
  const t = useTranslations('reader.drawer');
  const tags = (entry.tags ?? []).filter((tag) => KNOWN_TAGS.includes(tag));
  if (!entry.collins && !entry.oxford && tags.length === 0 && !entry.rank) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="entry-badges">
      {entry.collins ? (
        <span
          className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-[var(--gold-strong)]"
          title={t('collinsTitle', { stars: entry.collins })}
        >
          {'★'.repeat(entry.collins)}
          <span className="text-muted-foreground/40">{'★'.repeat(5 - entry.collins)}</span>
        </span>
      ) : null}
      {entry.oxford ? (
        <span className="rounded-md bg-[var(--primary-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--primary-text)]">
          {t('oxford3000')}
        </span>
      ) : null}
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          {t(`tags.${tag}`)}
        </span>
      ))}
      {entry.rank ? (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {t('frequencyRank', { rank: entry.rank.toLocaleString() })}
        </span>
      ) : null}
    </div>
  );
}

/** English definitions beside translated senses, then example sentences. */
export function EntryExtras({
  entry,
  word,
  onLookupWord,
}: {
  entry: ExpandedDictionaryEntry;
  word: string;
  onLookupWord?: (word: string) => void;
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
      {english.length > 0 && (
        <section className="border-b border-border px-4 py-3" data-testid="entry-english">
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {t('englishDefinitions')}
          </h3>
          <div className="text-sm text-muted-foreground">
            <SenseGroups senses={english} onLookupWord={onLookupWord} />
          </div>
        </section>
      )}
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
    </>
  );
}
