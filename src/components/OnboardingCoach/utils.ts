import { BookOpenText, Brain, Highlighter, type LucideIcon, MousePointer2 } from 'lucide-react';
import { OnboardingCoachStage } from './types';

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function getContent({
  stage,
  savedCount,
  t,
}: {
  stage: OnboardingCoachStage;
  savedCount: number;
  t: Translate;
}): { icon: LucideIcon; eyebrow: string; title: string; body: string } {
  switch (stage) {
    case 'lookup':
      return {
        icon: MousePointer2,
        eyebrow: t('lookup.eyebrow'),
        title: t('lookup.title'),
        body: t('lookup.body'),
      };
    case 'save':
      return {
        icon: BookOpenText,
        eyebrow: t('ready', { count: Math.min(savedCount, 3) }),
        title: savedCount === 0 ? t('save.titleFirst') : t('save.titleNext'),
        body: savedCount === 0 ? t('save.bodyFirst') : t('save.bodyNext'),
      };
    case 'phrase':
      return {
        icon: Highlighter,
        eyebrow: t('ready', { count: Math.min(savedCount, 3) }),
        title: t('phrase.title'),
        body: t('phrase.body'),
      };
    case 'practice':
    default:
      return {
        icon: Brain,
        eyebrow: t('practice.eyebrow'),
        title: t('practice.title'),
        body: t('practice.body'),
      };
  }
}
