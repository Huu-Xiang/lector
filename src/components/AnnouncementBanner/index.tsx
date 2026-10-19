'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { useAnnouncements } from '@/lib/use-announcements';
import { useLectorMode } from '@/lib/use-env';

export default function AnnouncementBanner() {
  const mode = useLectorMode();
  if (mode !== 'cloud') return null;
  return <CloudAnnouncementBanner />;
}

function CloudAnnouncementBanner() {
  const { data: session } = authClient.useSession();
  if (!session) return null;
  return <Banner signedUpAt={new Date(session.user.createdAt).getTime()} />;
}

function Banner({ signedUpAt }: { signedUpAt: number }) {
  const t = useTranslations('announcements');
  const { banner, dismiss } = useAnnouncements(signedUpAt);

  if (!banner) return null;

  return (
    <section
      aria-label={t('bannerLabel')}
      data-testid="announcement-banner"
      className="mb-6 flex items-start gap-3 rounded-2xl border border-[var(--gold-lip)] bg-[var(--gold-soft)] px-4 py-3"
    >
      <span className="mt-0.5 rounded-full bg-card px-2 py-0.5 text-xs font-bold tracking-wide text-[var(--gold-strong)] uppercase">
        {t('bannerLabel')}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-foreground">{t(`items.${banner.id}.title`)}</p>
        <p className="text-muted-foreground">
          {t(`items.${banner.id}.body`)}{' '}
          {banner.href && (
            <Link href={banner.href} className="font-medium text-primary hover:underline">
              {t('learnMore')}
            </Link>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => dismiss(banner.id)}
        aria-label={t('dismiss')}
        data-testid="announcement-banner-dismiss"
        className="-mt-1 -mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
