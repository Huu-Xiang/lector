export interface IOnboardingTipProps {
  title: string;
  body: string;
  onDismiss: () => void;
  className?: string;
  testId: string;
  /** In the iPhone app, lifts a bottom-pinned tip over the tab bar. */
  aboveTabBar?: boolean;
}
