import { getTranslations } from 'next-intl/server';
import type { PublicBook } from '@/lib/public-books';

export function CreativeCommonsLicenseLink({ credit }: { credit: string }) {
  const match = credit.match(/\bCC BY(-SA)? ([34]\.0)\b/);
  if (!match) return null;

  const [label, shareAlike, version] = match;
  const license = shareAlike ? 'by-sa' : 'by';
  return (
    <>
      {' '}
      <a className="underline" href={`https://creativecommons.org/licenses/${license}/${version}/`}>
        {label}
      </a>
    </>
  );
}

export default async function BookSource({ source }: { source: PublicBook['source'] }) {
  const t = await getTranslations('publicBooks');
  const credit = t.rich('source', {
    source: source.name,
    link: (chunks) => (
      <a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">
        {chunks}
      </a>
    ),
    license: source.license,
  });
  return (
    <>
      {credit}
      <CreativeCommonsLicenseLink credit={source.license} />
    </>
  );
}
