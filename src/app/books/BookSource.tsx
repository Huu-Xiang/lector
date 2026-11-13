import { getTranslations } from 'next-intl/server';
import type { PublicBook } from '@/lib/public-books';

export default async function BookSource({ source }: { source: PublicBook['source'] }) {
  const t = await getTranslations('publicBooks');
  return t.rich('source', {
    source: source.name,
    link: (chunks) => (
      <a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">
        {chunks}
      </a>
    ),
    license: source.license,
  });
}
