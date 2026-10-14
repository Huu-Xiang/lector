import Link from 'next/link';
import { useTranslations } from 'next-intl';
import UiLanguageSelect from '@/i18n/UiLanguageSelect';

export const SOURCE_URL = 'https://github.com/Huu-Xiang/lector';

export default function LegalLinks({ className = '' }: { className?: string }) {
  const t = useTranslations('legal');
  return (
    <nav
      aria-label={t('nav')}
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground ${className}`}
    >
      <Link href="/privacy" className="hover:text-foreground hover:underline">
        {t('privacy')}
      </Link>
      <Link href="/terms" className="hover:text-foreground hover:underline">
        {t('terms')}
      </Link>
      <Link href="/about" className="hover:text-foreground hover:underline">
        {t('about')}
      </Link>
      <a
        href={SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground hover:underline"
      >
        {t('source')}
      </a>
      <UiLanguageSelect />
    </nav>
  );
}
