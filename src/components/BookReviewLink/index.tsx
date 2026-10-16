'use client';

import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { bookReviewLink } from '@/lib/book-links';

export default function BookReviewLink({
  native,
  title,
  author,
  nativeTitle,
}: {
  native: string;
  title: string;
  author: string;
  nativeTitle?: string;
}) {
  const t = useTranslations('bookLink');
  const link = bookReviewLink(native, { title, author, nativeTitle });
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center gap-1 underline"
      data-testid="book-review-link"
    >
      {t('view', { site: t(`site.${link.site}`) })}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}
