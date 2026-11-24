import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import {
  ALTERNATIVE_COMPETITORS,
  COMPARISON_ROWS,
  COMPETITOR_FAQ_KEYS,
  alternativeJsonLd,
  alternativePath,
  type AlternativeCompetitor,
} from '@/lib/alternatives';
import { SITE_ORIGIN, listPublicBooks } from '@/lib/public-books';
import { findPrice, formatMoney, type PlanPrice } from '@/lib/plan-prices';
import { TIER_ALLOWANCES } from '@/lib/plan-prices';

export default async function AlternativesPage({
  competitor,
  prices,
  canonicalUrl,
}: {
  competitor: AlternativeCompetitor;
  prices: PlanPrice[] | null;
  canonicalUrl?: string;
}) {
  const t = await getTranslations('alternatives');
  const locale = await getLocale();
  const bookCount = listPublicBooks().length;
  const plusMonthly = findPrice(prices, 'cloud', 'month')?.unitPrice;
  const plusPriceText = plusMonthly ? formatMoney(plusMonthly, locale) : '$3';
  const competitorName = competitor === 'lingq' ? 'LingQ' : 'Readlang';
  const other = ALTERNATIVE_COMPETITORS.find((c) => c !== competitor)!;
  const otherName = other === 'lingq' ? 'LingQ' : 'Readlang';

  const faqKeys = COMPETITOR_FAQ_KEYS[competitor];
  const faq = faqKeys.map((key) => ({
    q: t(`${competitor}.faq.${key}Q`),
    a: t(`${competitor}.faq.${key}A`, {
      books: bookCount,
      plusPrice: plusPriceText,
      freeLookups: TIER_ALLOWANCES.free.glosses.toLocaleString(locale),
      freeDetailed: TIER_ALLOWANCES.free.detailed,
    }),
  }));

  const pageUrl = canonicalUrl ?? `${SITE_ORIGIN}${alternativePath(competitor)}`;
  const structured = alternativeJsonLd({
    competitor,
    url: pageUrl,
    title: t(`${competitor}.title`),
    description: t(`${competitor}.metaDescription`, { books: bookCount, plusPrice: plusPriceText }),
    allLabel: t('breadcrumbHome'),
    faq,
  });

  const rowValues = {
    books: bookCount,
    plusPrice: plusPriceText,
    freeLookups: TIER_ALLOWANCES.free.glosses.toLocaleString(locale),
    freeDetailed: TIER_ALLOWANCES.free.detailed,
  };

  return (
    <LegalShell title={t(`${competitor}.title`)} wide>
      {structured.map((entry, idx) => (
        <JsonLd key={idx} data={entry} />
      ))}

      <p className="max-w-3xl text-base text-muted-foreground">
        {t(`${competitor}.summary`, rowValues)}
      </p>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/books"
          className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
          data-testid="alt-cta-books"
        >
          {t('ctaBooks', { books: bookCount })}
        </Link>
        <Link
          href="/vocab-test"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
          data-testid="alt-cta-vocab"
        >
          {t('ctaVocabTest')}
        </Link>
        <Link
          href="/register"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
          data-testid="alt-cta-register"
        >
          {t('ctaRegister')}
        </Link>
      </div>

      <section className="space-y-3" data-testid="alt-comparison-table">
        <H2>{t('tableHeading', { competitor: competitorName })}</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 font-semibold">{t('colFeature')}</th>
                <th className="px-4 py-3 font-semibold">Readfox</th>
                <th className="px-4 py-3 font-semibold">{competitorName}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-4 py-3 font-medium text-foreground">
                    {t(`rows.${row}.label`)}
                  </th>
                  <td className="px-4 py-3 text-foreground">
                    {t(`rows.${row}.readfox`, rowValues)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t(`${competitor}.rows.${row}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {competitor === 'lingq' && (
        <section
          className="space-y-2 rounded-lg border border-primary/30 bg-muted/40 p-5"
          data-testid="alt-lingq-import"
        >
          <H2>{t('lingq.migrationHeading')}</H2>
          <p className="max-w-3xl text-muted-foreground">{t('lingq.migrationBody')}</p>
          <ol className="max-w-3xl list-decimal space-y-1 pl-5 text-foreground">
            <li>{t('lingq.migrationStep1')}</li>
            <li>{t('lingq.migrationStep2')}</li>
            <li>{t('lingq.migrationStep3')}</li>
          </ol>
        </section>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="space-y-2 rounded-lg border border-border p-5">
          <H2>{t('whenReadfoxHeading')}</H2>
          <ul className="list-disc space-y-1.5 pl-5 text-foreground">
            <li>{t(`${competitor}.readfoxWins.w1`, rowValues)}</li>
            <li>{t(`${competitor}.readfoxWins.w2`, rowValues)}</li>
            <li>{t(`${competitor}.readfoxWins.w3`, rowValues)}</li>
          </ul>
        </section>
        <section className="space-y-2 rounded-lg border border-border p-5">
          <H2>{t('whenCompetitorHeading', { competitor: competitorName })}</H2>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>{t(`${competitor}.competitorWins.w1`)}</li>
            <li>{t(`${competitor}.competitorWins.w2`)}</li>
            <li>{t(`${competitor}.competitorWins.w3`)}</li>
          </ul>
        </section>
      </div>

      <section className="space-y-2 pt-2" data-testid="alt-faq">
        <H2>{t('faqHeading')}</H2>
        {faq.map(({ q, a }) => (
          <details key={q} className="border-b border-border">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{q}</summary>
            <p className="max-w-prose pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </section>

      <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <Link href={alternativePath(other)} className="underline hover:text-foreground">
          {t('compareOther', { competitor: otherName })}
        </Link>
        <Link href="/pricing" className="underline hover:text-foreground">
          {t('seePricing')}
        </Link>
        <Link href="/books" className="underline hover:text-foreground">
          {t('browseLibrary')}
        </Link>
      </p>
    </LegalShell>
  );
}
