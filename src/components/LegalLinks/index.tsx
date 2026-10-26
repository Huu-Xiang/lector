import Link from 'next/link';
import { useTranslations } from 'next-intl';
import UiLanguageSelect from '@/i18n/UiLanguageSelect';

export const SOURCE_URL = 'https://github.com/Huu-Xiang/lector';

/**
 * `center` is the page footer. `start` is the sidebar: links in one left-aligned
 * row, with the language select on its own row at full width.
 */
export default function LegalLinks({
  className = '',
  layout = 'center',
}: {
  className?: string;
  layout?: 'center' | 'start';
}) {
  const t = useTranslations('legal');
  const sidebar = layout === 'start';
  const links = (
    <>
      <Link href="/pricing" className="hover:text-foreground hover:underline">
        {t('pricing')}
      </Link>
      <Link href="/privacy" className="hover:text-foreground hover:underline">
        {t('privacy')}
      </Link>
      <Link href="/terms" className="hover:text-foreground hover:underline">
        {t('terms')}
      </Link>
      <Link href="/refunds" className="hover:text-foreground hover:underline">
        {t('refunds')}
      </Link>
      <Link href="/about" className="hover:text-foreground hover:underline">
        {t('about')}
      </Link>
    </>
  );

  if (sidebar) {
    return (
      <div className={`space-y-2 ${className}`}>
        <nav
          aria-label={t('nav')}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
        >
          {links}
        </nav>
        <UiLanguageSelect className="w-full" showLabel />
      </div>
    );
  }

  return (
    <nav
      aria-label={t('nav')}
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground ${className}`}
    >
      <Link href="/books" className="hover:text-foreground hover:underline">
        {t('freeBooks')}
      </Link>
      {links}
      <UiLanguageSelect />
    </nav>
  );
}
