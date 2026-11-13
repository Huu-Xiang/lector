'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gauge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActiveLanguage } from '@/utils/hooks';
import { getNavLinkClassname } from '../utils';

/** The vocabulary test is English only, so the link shows while English is the active language. */
export default function VocabTestNavLink({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations('vocabTest');
  const language = useActiveLanguage().code;
  const pathname = usePathname();
  const isActive = pathname === '/vocab-test' || pathname === '/vocab-test/history';
  if (language !== 'en' && !isActive) return null;
  return (
    <Link
      href="/vocab-test?from=nav"
      className={getNavLinkClassname({ isActive, isMobile: false, collapsed })}
      title={collapsed ? t('navLink') : undefined}
      aria-label={collapsed ? t('navLink') : undefined}
      aria-current={isActive ? 'page' : undefined}
      data-testid="vocab-test-nav-link"
    >
      <Gauge size="20" />
      {!collapsed && t('navLink')}
    </Link>
  );
}
