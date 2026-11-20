'use client';

import RouteErrorView from '@/components/RouteErrorView';

export default function PracticeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorView error={error} reset={reset} />;
}
