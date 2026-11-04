'use client';

import { useTranslations } from 'next-intl';
import { Kbd, KbdGroup } from '@/components/ui/kbd';

export default function SentenceTranslation({
  text,
  show,
  onShow,
  className = 'mb-4 text-center',
}: {
  text: string | undefined;
  show: boolean;
  onShow: () => void;
  className?: string;
}) {
  const t = useTranslations('practice.question');
  if (!text) return null;
  if (show) {
    return (
      <p
        className={`${className} text-sm text-muted-foreground italic`}
        data-testid="sentence-translation"
      >
        {text}
      </p>
    );
  }
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onShow}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground italic transition-colors hover:text-foreground"
      >
        {t('showTranslation')}
        <KbdGroup>
          <Kbd>Alt</Kbd>
          <Kbd>T</Kbd>
        </KbdGroup>
      </button>
    </div>
  );
}
