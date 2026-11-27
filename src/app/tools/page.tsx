import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import PublicLink from '@/components/PublicLink';
import { listPublicBooks } from '@/lib/public-books';
import { TIER_ALLOWANCES } from '@/lib/plan-prices';
import { publicUrl } from '@/lib/public-locale';
import { activePublicLocalePrefix, publicAlternatesForRequest } from '@/lib/public-locale.server';
import { buildPublicTwitter, withPublicOg } from '@/lib/site-seo';
import {
  WORKFLOW_TOOL_SLUGS,
  getToolsUi,
  getWorkflowToolContent,
  toolPath,
  toolsHubJsonLd,
} from '@/lib/tools';

export async function generateMetadata(): Promise<Metadata> {
  const [locale, { alternates, canonicalUrl }] = await Promise.all([
    getLocale(),
    publicAlternatesForRequest('/tools'),
  ]);
  const ui = getToolsUi(locale);
  return {
    title: ui.hubMetaTitle,
    description: ui.hubMetaDescription,
    alternates,
    openGraph: withPublicOg({
      title: ui.hubMetaTitle,
      description: ui.hubMetaDescription,
      url: canonicalUrl,
      siteName: 'Readfox',
      type: 'website',
    }),
    twitter: buildPublicTwitter(ui.hubMetaTitle, ui.hubMetaDescription),
  };
}

export default async function ToolsHubPage() {
  const [locale, localePrefix, { canonicalUrl }] = await Promise.all([
    getLocale(),
    activePublicLocalePrefix(),
    publicAlternatesForRequest('/tools'),
  ]);
  const ui = getToolsUi(locale);
  const bookCount = listPublicBooks().length;
  const vars = {
    books: bookCount,
    freeLookups: TIER_ALLOWANCES.free.glosses.toLocaleString(locale),
    freeDetailed: TIER_ALLOWANCES.free.detailed,
  };

  const workflows = WORKFLOW_TOOL_SLUGS.map((slug) => getWorkflowToolContent(slug, locale, vars));

  const cards = [
    {
      href: '/tools/text-difficulty',
      title: ui.difficultyCardTitle,
      description: ui.difficultyCardDesc,
      testId: 'tool-hub-link-text-difficulty',
    },
    {
      href: '/vocab-test',
      title: ui.vocabCardTitle,
      description: ui.vocabCardDesc,
      testId: 'tool-hub-link-vocab-test',
    },
    ...workflows.map((w) => ({
      href: toolPath(w.slug),
      title: w.title,
      description: w.metaDescription,
      testId: `tool-hub-link-${w.slug}`,
    })),
  ];

  const structured = toolsHubJsonLd({
    url: canonicalUrl,
    title: ui.hubTitle,
    description: ui.hubMetaDescription,
    homeLabel: ui.breadcrumbHome,
    toolsLabel: ui.breadcrumbTools,
    localePrefix,
    inLanguage: locale,
    items: cards.map((card) => ({
      name: card.title,
      url: publicUrl(card.href, localePrefix),
      description: card.description,
    })),
  });

  return (
    <LegalShell title={ui.hubTitle} wide>
      {structured.map((entry, idx) => (
        <JsonLd key={idx} data={entry} />
      ))}

      <p className="max-w-3xl text-base text-muted-foreground">{ui.hubIntro}</p>

      <div className="grid gap-6 sm:grid-cols-2" data-testid="tools-hub-cards">
        {cards.map((card) => (
          <section
            key={card.href}
            className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-6"
          >
            <div className="space-y-2">
              <H2>{card.title}</H2>
              <p className="text-sm leading-relaxed text-muted-foreground">{card.description}</p>
            </div>
            <div>
              <PublicLink
                href={card.href}
                className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                data-testid={card.testId}
              >
                {ui.hubCtaOpen}
              </PublicLink>
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <PublicLink
          href="/books"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
        >
          {ui.browseBooksCta.replace('{books}', String(bookCount))}
        </PublicLink>
        <PublicLink
          href="/alternatives"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
        >
          {ui.alternativesLink}
        </PublicLink>
      </div>
    </LegalShell>
  );
}
