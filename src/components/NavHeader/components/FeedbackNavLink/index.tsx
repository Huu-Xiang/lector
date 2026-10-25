'use client';

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useLectorMode } from '@/lib/use-env';
import { getNavLinkClassname } from '../utils';

/** Desktop sidebar shortcut to the WeChat card in Settings, for Chinese-speaking cloud users. */
export default function FeedbackNavLink({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations('settings.feedback');
  const locale = useLocale();
  const mode = useLectorMode();
  if (mode !== 'cloud' || !locale.startsWith('zh')) return null;
  return (
    <Link
      href="/settings#feedback"
      className={getNavLinkClassname({ isActive: false, isMobile: false, collapsed })}
      title={collapsed ? t('nav') : undefined}
      aria-label={collapsed ? t('nav') : undefined}
      data-testid="feedback-nav-link"
    >
      <MessageCircle size="20" />
      {!collapsed && t('nav')}
    </Link>
  );
}
