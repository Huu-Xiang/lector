import { BookOpenText, Brain, type LucideIcon, MousePointer2 } from 'lucide-react';
import { OnboardingCoachStage } from './types';

type Translate = (key: string, values?: Record<string, string | number>) => string;

export const COACH_STEPS: readonly OnboardingCoachStage[] = ['lookup', 'save', 'practice'];

export function getContent({ stage, t }: { stage: OnboardingCoachStage; t: Translate }): {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
} {
  const eyebrow = t('step', { step: COACH_STEPS.indexOf(stage) + 1, total: COACH_STEPS.length });
  const icon = stage === 'lookup' ? MousePointer2 : stage === 'save' ? BookOpenText : Brain;
  return { icon, eyebrow, title: t(`${stage}.title`), body: t(`${stage}.body`) };
}
