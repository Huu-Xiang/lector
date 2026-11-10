export type OnboardingCoachStage = 'lookup' | 'save' | 'practice';

export interface IOnboardingCoachProps {
  stage: OnboardingCoachStage;
  /** The reader saves a looked-up word by itself, so the guide has no save step. */
  autoSave: boolean;
  onStartPractice?: () => void;
  onSkip: () => void;
}
