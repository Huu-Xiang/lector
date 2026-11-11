'use client';

import Link from 'next/link';
import { Gauge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActiveLanguage } from '@/utils/hooks';
import { getNavLinkClassname } from '../utils';

/** The vocabulary test is English only, so the link shows while English is the active language. */
export default function VocabTestNavLink({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations('vocabTest');
  const language = useActiveLanguage().code;
  if (language !== 'en') return null;
  return (
    <Link
      href="/vocab-test?from=nav"
      className={getNavLinkClassname({ isActive: false, isMobile: false, collapsed })}
      title={collapsed ? t('navLink') : undefined}
      aria-label={collapsed ? t('navLink') : undefined}
      data-testid="vocab-test-nav-link"
    >
      <Gauge size="20" />
      {!collapsed && t('navLink')}
    </Link>
  );
}
