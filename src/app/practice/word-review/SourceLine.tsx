'use client';

import { useLocale, useTranslations } from 'next-intl';
import { getActiveLanguage } from '@/lib/data-layer';
import type { SentenceSource } from '@/types';
import { buildSourceLine } from './sentence-source';

function renderLink(href: string | null, chunks: React.ReactNode) {
  if (!href) return <>{chunks}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:text-foreground"
    >
      {chunks}
    </a>
  );
}

export default function SourceLine({
  source,
  className = 'mb-2 text-center',
}: {
  source: SentenceSource | undefined;
  className?: string;
}) {
  const t = useTranslations('practice.words.source');
  const line = buildSourceLine(source, getActiveLanguage(), useLocale());
  if (!line) return null;

  let text: React.ReactNode;
  if (line.kind === 'library') {
    const name = line.chapter ? `${line.book} · ${line.chapter}` : line.book;
    text = t.rich('library', { name, link: (chunks) => renderLink(line.href, chunks) });
  } else if (line.kind === 'tatoeba') {
    text = t.rich('tatoeba', { link: (chunks) => renderLink(line.href, chunks) });
  } else {
    text = t('ai');
  }

  return (
    <p className={`${className} text-xs text-muted-foreground`} data-testid="sentence-source">
      {text}
    </p>
  );
}
