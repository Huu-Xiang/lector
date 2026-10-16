'use client';

import { useTranslations } from 'next-intl';
import { examLabels } from '@/lib/reading-level';

/** A CEFR badge followed by exam tags that suit the learner's native language. */
export default function LevelTags({
  language,
  level,
  native,
}: {
  language: string;
  level: string;
  native: string;
}) {
  const tl = useTranslations('readingLevel');
  const tags = examLabels(language, level, native, (exam, score) => tl(`exam.${exam}`, { score }));
  return (
    <>
      <span
        className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--primary-text)]"
        title={tl('approx')}
      >
        {level}
      </span>
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          title={tl('approx')}
        >
          {tag}
        </span>
      ))}
    </>
  );
}
