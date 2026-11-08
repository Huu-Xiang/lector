'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getEntitlements } from '@/lib/data-layer';
import { useLectorMode } from '@/lib/use-env';

export default function UpgradeLink({ iconOnly = false }: { iconOnly?: boolean }) {
  const t = useTranslations('nav');
  const mode = useLectorMode();
  const [free, setFree] = useState(false);

  useEffect(() => {
    if (mode !== 'cloud') return;
    getEntitlements()
      .then((entitlements) => setFree(entitlements?.plan === 'free'))
      .catch(() => {});
  }, [mode]);

  if (!free) return null;
  return (
    <Link
      href="/subscribe"
      title={t('upgrade')}
      aria-label={t('upgrade')}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-primary/40 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-[var(--primary-soft)]"
      data-testid="upgrade-link"
    >
      <Crown className="h-3 w-3" aria-hidden="true" />
      {!iconOnly && t('upgrade')}
    </Link>
  );
}
