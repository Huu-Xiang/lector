import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { WordStage } from '@/types';

export default function StageBadge({ stage }: { stage: WordStage }) {
  const t = useTranslations('practice.words.stage');
  return (
    <Badge variant="muted" data-testid="stage-badge" data-stage={stage}>
      {t(stage)}
    </Badge>
  );
}
