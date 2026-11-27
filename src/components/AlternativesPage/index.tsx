import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import PublicLink from '@/components/PublicLink';
import {
  COMPARISON_ROWS,
  COMPETITOR_DISPLAY_NAMES,
  COMPETITOR_FAQ_KEYS,
  alternativeJsonLd,
  alternativePath,
  isLingqVariant,
  isWave3AlternativeCompetitor,
  relatedAlternatives,
  type AlternativeCompetitor,
} from '@/lib/alternatives';
import { getWave3AlternativeContent } from '@/lib/alternatives-wave3';
import { getToolsUi } from '@/lib/tools';
import { SITE_ORIGIN, listPublicBooks } from '@/lib/public-books';
import { findPrice, formatMoney, TIER_ALLOWANCES, type PlanPrice } from '@/lib/plan-prices';

export default async function AlternativesPage({
  competitor,
  prices,
  canonicalUrl,
  localePrefix = '',
}: {
  competitor: AlternativeCompetitor;
  prices: PlanPrice[] | null;
  canonicalUrl?: string;
  localePrefix?: string;
}) {
  const t = await getTranslations('alternatives');
  const locale = await getLocale();
  const bookCount = listPublicBooks().length;
  const plusMonthly = findPrice(prices, 'cloud', 'month')?.unitPrice;
  const plusPriceText = plusMonthly ? formatMoney(plusMonthly, locale) : '$3';

  const rowValues = {
    books: bookCount,
    plusPrice: plusPriceText,
    freeLookups: TIER_ALLOWANCES.free.glosses.toLocaleString(locale),
    freeDetailed: TIER_ALLOWANCES.free.detailed,
  };

  const isWave3 = isWave3AlternativeCompetitor(competitor);
  const wave3 = isWave3 ? getWave3AlternativeContent(competitor, locale, rowValues) : null;

  const competitorName = wave3 ? wave3.competitorName : COMPETITOR_DISPLAY_NAMES[competitor];
  const title = wave3 ? wave3.title : t(`${competitor}.title`);
  const summary = wave3 ? wave3.summary : t(`${competitor}.summary`, rowValues);
  const metaDescription = wave3
    ? wave3.metaDescription
    : t(`${competitor}.metaDescription`, { books: bookCount, plusPrice: plusPriceText });

  const faq = wave3
    ? wave3.faq
    : COMPETITOR_FAQ_KEYS[competitor as 'lingq' | 'readlang'].map((key) => ({
        q: t(`${competitor}.faq.${key}Q`),
        a: t(`${competitor}.faq.${key}A`, rowValues),
      }));

  const readfoxWins: [string, string, string] = wave3
    ? wave3.readfoxWins
    : [
        t(`${competitor}.readfoxWins.w1`, rowValues),
        t(`${competitor}.readfoxWins.w2`, rowValues),
        t(`${competitor}.readfoxWins.w3`, rowValues),
      ];

  const competitorWins: [string, string, string] = wave3
    ? wave3.competitorWins
    : [
        t(`${competitor}.competitorWins.w1`),
        t(`${competitor}.competitorWins.w2`),
        t(`${competitor}.competitorWins.w3`),
      ];

  const pageUrl = canonicalUrl ?? `${SITE_ORIGIN}${alternativePath(competitor)}`;
  const structured = alternativeJsonLd({
    competitor,
    url: pageUrl,
    title,
    description: metaDescription,
    allLabel: t('breadcrumbHome'),
    hubLabel: t('hub.breadcrumbAlternatives'),
    localePrefix,
    inLanguage: locale,
    faq,
  });

  const related = relatedAlternatives(competitor);

  return (
    <LegalShell title={title} wide>
      {structured.map((entry, idx) => (
        <JsonLd key={idx} data={entry} />
      ))}

      <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">{summary}</p>

      <div className="flex flex-wrap gap-3">
        {wave3?.highlightCta ? (
          <PublicLink
            href={wave3.highlightCta.href}
            className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
            data-testid="alt-cta-highlight"
          >
            {wave3.highlightCta.label}
          </PublicLink>
        ) : (
          <PublicLink
            href="/books"
            className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
            data-testid="alt-cta-books"
          >
            {t('ctaBooks', { books: bookCount })}
          </PublicLink>
        )}
        <PublicLink
          href="/vocab-test"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
          data-testid="alt-cta-vocab"
        >
          {t('ctaVocabTest')}
        </PublicLink>
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
                    {wave3 ? wave3.rows[row] : t(`${competitor}.rows.${row}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isLingqVariant(competitor) && (
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
            {readfoxWins.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="space-y-2 rounded-lg border border-border p-5">
          <H2>{t('whenCompetitorHeading', { competitor: competitorName })}</H2>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            {competitorWins.map((item) => (
              <li key={item}>{item}</li>
            ))}
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

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <PublicLink href="/alternatives" className="underline hover:text-foreground">
          {t('hub.breadcrumbAlternatives')}
        </PublicLink>
        {related.map((other) => (
          <PublicLink
            key={other}
            href={alternativePath(other)}
            className="underline hover:text-foreground"
          >
            {t('compareOther', { competitor: COMPETITOR_DISPLAY_NAMES[other] })}
          </PublicLink>
        ))}
        <PublicLink href="/tools/text-difficulty" className="underline hover:text-foreground">
          {getToolsUi(locale).diffTitle}
        </PublicLink>
        <PublicLink href="/pricing" className="underline hover:text-foreground">
          {t('seePricing')}
        </PublicLink>
        <PublicLink href="/books" className="underline hover:text-foreground">
          {t('browseLibrary')}
        </PublicLink>
      </p>
    </LegalShell>
  );
}
