import { BookOpenText, Brain, type LucideIcon, MousePointer2 } from 'lucide-react';
import { OnboardingCoachStage } from './types';

type Translate = (key: string, values?: Record<string, string | number>) => string;

export const COACH_STEPS: readonly OnboardingCoachStage[] = ['lookup', 'save', 'practice'];
export const AUTO_SAVE_STEPS: readonly OnboardingCoachStage[] = ['lookup', 'practice'];

export function getContent({
  stage,
  autoSave,
  t,
}: {
  stage: OnboardingCoachStage;
  autoSave: boolean;
  t: Translate;
}): {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
} {
  const steps = autoSave && stage !== 'save' ? AUTO_SAVE_STEPS : COACH_STEPS;
  const eyebrow = t('step', { step: steps.indexOf(stage) + 1, total: steps.length });
  const icon = stage === 'lookup' ? MousePointer2 : stage === 'save' ? BookOpenText : Brain;
  const body = autoSave && stage === 'lookup' ? t('lookup.bodyAutoSave') : t(`${stage}.body`);
  return { icon, eyebrow, title: t(`${stage}.title`), body };
}
