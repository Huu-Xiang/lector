import { getTranslations } from 'next-intl/server';
import PublicLink from '@/components/PublicLink';
import type { VocabTestLanguage } from '@/lib/vocab-test-data';

const ITEMS: Array<{ code: VocabTestLanguage; href: string; label: string }> = [
  { code: 'en', href: '/vocab-test', label: 'English' },
  { code: 'fr', href: '/vocab-test/fr', label: 'Français' },
  { code: 'es', href: '/vocab-test/es', label: 'Español' },
];

export default async function VocabTestLanguageTabs({ active }: { active: VocabTestLanguage }) {
  const t = await getTranslations('vocabTest');
  return (
    <nav
      aria-label={t('switchLabel')}
      data-testid="vocab-language-tabs"
      className="flex flex-wrap gap-2"
    >
      {ITEMS.map((item) => {
        const current = item.code === active;
        return (
          <PublicLink
            key={item.code}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={
              current
                ? 'rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground'
                : 'rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted'
            }
          >
            {item.label}
          </PublicLink>
        );
      })}
    </nav>
  );
}
