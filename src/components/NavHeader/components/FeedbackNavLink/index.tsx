'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLectorMode } from '@/lib/use-env';
import { getNavLinkClassname } from '../utils';

export default function FeedbackNavLink({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations('feedback');
  const mode = useLectorMode();
  const pathname = usePathname();
  if (mode !== 'cloud') return null;
  return (
    <Link
      href="/feedback"
      className={getNavLinkClassname({
        isActive: pathname === '/feedback',
        isMobile: false,
        collapsed,
      })}
      title={collapsed ? t('nav') : undefined}
      aria-label={collapsed ? t('nav') : undefined}
      data-testid="feedback-nav-link"
    >
      <MessageCircle size="20" />
      {!collapsed && t('nav')}
    </Link>
  );
}
