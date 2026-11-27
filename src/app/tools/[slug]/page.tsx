import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import InteractiveContextPreview from '@/components/InteractiveContextPreview';
import JsonLd from '@/components/JsonLd';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import PublicLink from '@/components/PublicLink';
import { listPublicBooks } from '@/lib/public-books';
import { TIER_ALLOWANCES } from '@/lib/plan-prices';
import { activePublicLocalePrefix, publicAlternatesForRequest } from '@/lib/public-locale.server';
import { buildPublicTwitter, withPublicOg } from '@/lib/site-seo';
import {
  WORKFLOW_TOOL_SLUGS,
  getToolsUi,
  getWorkflowToolContent,
  isWorkflowToolSlug,
  toolPageJsonLd,
  toolPath,
} from '@/lib/tools';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return WORKFLOW_TOOL_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isWorkflowToolSlug(slug)) notFound();
  const [locale, { alternates, canonicalUrl }] = await Promise.all([
    getLocale(),
    publicAlternatesForRequest(toolPath(slug)),
  ]);
  const content = getWorkflowToolContent(slug, locale, {
    books: listPublicBooks().length,
    freeLookups: TIER_ALLOWANCES.free.glosses.toLocaleString(locale),
    freeDetailed: TIER_ALLOWANCES.free.detailed,
  });

  return {
    title: content.metaTitle,
    description: content.metaDescription,
    alternates,
    openGraph: withPublicOg({
      title: content.metaTitle,
      description: content.metaDescription,
      url: canonicalUrl,
      siteName: 'Readfox',
      type: 'website',
    }),
    twitter: buildPublicTwitter(content.metaTitle, content.metaDescription),
  };
}

export default async function WorkflowToolPage({ params }: Props) {
  const { slug } = await params;
  if (!isWorkflowToolSlug(slug)) notFound();

  const [locale, localePrefix, { canonicalUrl }] = await Promise.all([
    getLocale(),
    activePublicLocalePrefix(),
    publicAlternatesForRequest(toolPath(slug)),
  ]);
  const ui = getToolsUi(locale);
  const bookCount = listPublicBooks().length;
  const content = getWorkflowToolContent(slug, locale, {
    books: bookCount,
    freeLookups: TIER_ALLOWANCES.free.glosses.toLocaleString(locale),
    freeDetailed: TIER_ALLOWANCES.free.detailed,
  });

  const structured = toolPageJsonLd({
    url: canonicalUrl,
    title: content.title,
    description: content.metaDescription,
    homeLabel: ui.breadcrumbHome,
    toolsLabel: ui.breadcrumbTools,
    localePrefix,
    inLanguage: locale,
    faq: content.faq,
  });

  const otherSlugs = WORKFLOW_TOOL_SLUGS.filter((s) => s !== slug);

  return (
    <LegalShell title={content.title} wide>
      {structured.map((entry, idx) => (
        <JsonLd key={idx} data={entry} />
      ))}

      <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">{content.summary}</p>

      <div className="flex flex-wrap gap-3">
        {content.primaryCtaHref === '/register' ? (
          <Link
            href="/register"
            className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
            data-testid="tool-primary-cta"
          >
            {content.primaryCtaLabel}
          </Link>
        ) : (
          <PublicLink
            href={content.primaryCtaHref}
            className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
            data-testid="tool-primary-cta"
          >
            {content.primaryCtaLabel}
          </PublicLink>
        )}
        <PublicLink
          href="/tools/text-difficulty"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
        >
          {ui.difficultyCardTitle}
        </PublicLink>
        <PublicLink
          href="/books"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
        >
          {ui.browseBooksCta.replace('{books}', String(bookCount))}
        </PublicLink>
      </div>

      <InteractiveContextPreview
        heading={content.previewHeading}
        hint={content.previewHint}
        passage={content.previewPassage}
        words={content.previewWords}
        plainDictLabel={ui.plainDictLabel}
        inContextLabel={ui.inContextLabel}
        savedCardHint={ui.savedCardHint}
      />

      <section className="space-y-3">
        <H2>{content.stepsHeading}</H2>
        <div className="grid gap-4 sm:grid-cols-3">
          {content.steps.map((step) => (
            <div key={step.title} className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2 pt-2" data-testid="tool-faq">
        <H2>{ui.faqHeading}</H2>
        {content.faq.map(({ q, a }) => (
          <details key={q} className="border-b border-border">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{q}</summary>
            <p className="max-w-prose pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </section>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <PublicLink href="/tools" className="underline hover:text-foreground">
          {ui.allToolsLink}
        </PublicLink>
        <PublicLink href="/tools/text-difficulty" className="underline hover:text-foreground">
          {ui.diffTitle}
        </PublicLink>
        {otherSlugs.map((other) => (
          <PublicLink
            key={other}
            href={toolPath(other)}
            className="underline hover:text-foreground"
          >
            {getWorkflowToolContent(other, locale, {
              books: bookCount,
              freeLookups: TIER_ALLOWANCES.free.glosses.toLocaleString(locale),
              freeDetailed: TIER_ALLOWANCES.free.detailed,
            }).eyebrow}
          </PublicLink>
        ))}
        <PublicLink href="/alternatives" className="underline hover:text-foreground">
          {ui.alternativesLink}
        </PublicLink>
      </p>
    </LegalShell>
  );
}
