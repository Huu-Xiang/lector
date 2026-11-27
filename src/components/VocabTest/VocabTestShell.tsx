'use client';

import type { ReactNode } from 'react';
import { LegalShell } from '@/components/LegalLinks/shell';
import PageHeader from '@/components/PageHeader';
import { authClient } from '@/lib/auth-client';
import { useLectorMode } from '@/lib/use-env';
import { haptic, useIsNativeApp } from '@/lib/native-app';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Props = {
  title: string;
  children: ReactNode;
  visitorTools?: ReactNode;
  showVisitorBack?: boolean;
};

export default function VocabTestShell(props: Props) {
  const nativeApp = useIsNativeApp();
  const mode = useLectorMode();
  const t = useTranslations('nav');
  const vt = useTranslations('vocabTest');
  if (nativeApp) {
    const fromSetup = new URLSearchParams(window.location.search).get('from') === 'setup';
    return (
      <main
        className="native-compact-page mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-8"
        data-testid="vocab-test-workspace"
        data-native-vocab-shell
      >
        <Link
          href={fromSetup ? '/setup' : '/me'}
          onClick={() => void haptic()}
          className="mb-2 inline-flex min-h-11 min-w-11 items-center text-primary"
        >
          <ChevronLeft className="size-6" strokeWidth={2.25} aria-hidden />
          {t('back')}
        </Link>
        <PageHeader title={vt('navLink')} />
        <div className="space-y-5">{props.children}</div>
      </main>
    );
  }
  return mode === 'cloud' ? <CloudShell {...props} /> : <VisitorShell {...props} />;
}

export function VocabVisitorOnly({ children }: { children: ReactNode }) {
  return useIsNativeApp() ? null : children;
}

export function VocabLanguageTabsVisibility({ children }: { children: ReactNode }) {
  const nativeApp = useIsNativeApp();
  return nativeApp && new URLSearchParams(window.location.search).get('from') === 'setup'
    ? null
    : children;
}

function CloudShell(props: Props) {
  const { data: session } = authClient.useSession();
  if (!session) return <VisitorShell {...props} />;

  return (
    <main
      className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-8"
      data-testid="vocab-test-workspace"
    >
      <PageHeader title={props.title} />
      <div className="space-y-5">{props.children}</div>
    </main>
  );
}

function VisitorShell({ title, children, visitorTools, showVisitorBack }: Props) {
  return (
    <LegalShell title={title} showBack={showVisitorBack}>
      {visitorTools}
      {children}
    </LegalShell>
  );
}
