export type OnboardingCoachStage = 'lookup' | 'save' | 'practice';

export interface IOnboardingCoachProps {
  stage: OnboardingCoachStage;
  onStartPractice?: () => void;
  onSkip: () => void;
}
