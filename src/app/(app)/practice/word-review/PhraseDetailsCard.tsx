'use client';

import { useTranslations } from 'next-intl';
import type { AiPhraseDetails } from '@/types';

export default function PhraseDetailsCard({
  details,
  className = '',
}: {
  details?: AiPhraseDetails | null;
  className?: string;
}) {
  const t = useTranslations('reader.drawer');
  if (!details) return null;
  const hasAny = Boolean(
    details.idiomaticMeaning || details.literalBreakdown || details.usageNotes || details.register,
  );
  if (!hasAny) return null;

  return (
    <div
      className={`space-y-1.5 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-left text-xs ${className}`}
      data-testid="review-phrase-details"
    >
      {details.register && (
        <span className="inline-block rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">
          {details.register}
        </span>
      )}
      {details.idiomaticMeaning && (
        <div>
          <span className="font-medium text-muted-foreground">{t('idiomaticMeaning')}: </span>
          <span className="text-foreground">{details.idiomaticMeaning}</span>
        </div>
      )}
      {details.literalBreakdown && (
        <div>
          <span className="font-medium text-muted-foreground">{t('literally')}: </span>
          <span className="text-muted-foreground">{details.literalBreakdown}</span>
        </div>
      )}
      {details.usageNotes && (
        <div>
          <span className="font-medium text-muted-foreground">{t('usage')}: </span>
          <span className="text-muted-foreground">{details.usageNotes}</span>
        </div>
      )}
    </div>
  );
}
