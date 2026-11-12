import { Suspense } from 'react';
import BetaLogin from './BetaLogin';

export const metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
} as const;

export default function BetaLoginPage() {
  return (
    <Suspense fallback={null}>
      <BetaLogin />
    </Suspense>
  );
}
