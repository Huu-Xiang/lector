'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

// A page loaded straight from another site (or a new tab) has no page of ours behind it.
export default function BackButton() {
  const t = useTranslations('legal');
  const router = useRouter();
  function goBack() {
    const entry = performance.getEntriesByType('navigation')[0]?.name ?? '';
    const isEntryPage = entry.split('#')[0] === window.location.href.split('#')[0];
    const fromOutside = isEntryPage && !document.referrer.startsWith(window.location.origin);
    if (!fromOutside && window.history.length > 1) router.back();
    else router.push('/');
  }
  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      data-testid="legal-back"
    >
      <ArrowLeft className="h-4 w-4" />
      {t('back')}
    </button>
  );
}
