import Link from 'next/link';
import clsx from 'clsx';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import OnboardingTip from '@/components/OnboardingTip';
import { iconMap } from '../../constants';
import { reviewBadgeText } from '@/lib/review-badge';
import { getNavLinkClassname } from '../utils';
import { isTabPath } from '@/lib/tab-scroll';

export interface NavTourTip {
  title: string;
  body: string;
  testId: string;
  onNavigate: () => void;
  onDismiss: () => void;
}

export default function NavLink({
  link,
  isMobile,
  collapsed = false,
  tourTip,
  badge,
}: {
  isMobile: boolean;
  collapsed?: boolean;
  link: { href: string; label: string };
  tourTip?: NavTourTip;
  badge?: { count: number; description: string };
}) {
  const pathname = usePathname();
  const isActive = pathname === link.href;
  const Icon = iconMap[link.href];
  const linkClasses = useMemo(() => {
    return getNavLinkClassname({ isActive, isMobile, collapsed });
  }, [isActive, isMobile, collapsed]);

  const showBadge = !!badge && badge.count > 0 && !isActive;
  const badgeId = `nav-badge-${link.href.slice(1) || 'library'}-${isMobile ? 'mobile' : 'desktop'}`;

  return (
    <div className={isMobile ? 'relative flex flex-1' : 'relative w-full'}>
      <Link
        key={link.href}
        href={link.href}
        scroll={!isTabPath(link.href)}
        className={clsx(
          linkClasses,
          tourTip
            ? 'relative z-60 bg-[var(--gold-soft)] text-[var(--gold-strong)] ring-2 ring-[var(--gold-strong)] ring-offset-2 ring-offset-card'
            : '',
        )}
        data-onboarding-highlight={tourTip ? link.href.slice(1) || 'library' : undefined}
        onClick={tourTip?.onNavigate}
        aria-describedby={showBadge ? badgeId : undefined}
        title={collapsed && !isMobile ? link.label : undefined}
        aria-label={collapsed && !isMobile ? link.label : undefined}
      >
        <Icon size="20" />
        {!(collapsed && !isMobile) && link.label}
      </Link>
      {showBadge && badge && (
        <>
          <span id={badgeId} className="sr-only">
            {badge.description}
          </span>
          <span
            aria-hidden="true"
            data-testid={`nav-badge-${isMobile ? 'mobile' : 'desktop'}`}
            className={clsx(
              'pointer-events-none absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground',
              isMobile
                ? 'top-1.5 left-1/2 ml-2'
                : collapsed
                  ? 'top-1 right-1'
                  : 'top-1/2 right-3 -translate-y-1/2',
            )}
          >
            {reviewBadgeText(badge.count)}
          </span>
        </>
      )}
      {tourTip && (
        <OnboardingTip
          title={tourTip.title}
          body={tourTip.body}
          onDismiss={tourTip.onDismiss}
          testId={`${tourTip.testId}-${isMobile ? 'mobile' : 'desktop'}`}
          aboveTabBar={isMobile}
          className={
            isMobile
              ? 'fixed right-3 bottom-20 left-3 block w-auto sm:hidden'
              : 'absolute top-0 left-[calc(100%+0.75rem)] hidden sm:block'
          }
        />
      )}
    </div>
  );
}
