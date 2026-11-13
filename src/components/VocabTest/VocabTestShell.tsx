'use client';

import type { ReactNode } from 'react';
import { LegalShell } from '@/components/LegalLinks/shell';
import PageHeader from '@/components/PageHeader';
import { authClient } from '@/lib/auth-client';
import { useLectorMode } from '@/lib/use-env';

type Props = { title: string; children: ReactNode; visitorTools?: ReactNode };

export default function VocabTestShell(props: Props) {
  return useLectorMode() === 'cloud' ? <CloudShell {...props} /> : <VisitorShell {...props} />;
}

function CloudShell(props: Props) {
  const { data: session } = authClient.useSession();
  if (!session) return <VisitorShell {...props} />;

  return (
    <main
      className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-8"
      data-testid="vocab-test-workspace"
    >
      <PageHeader title={props.title} />
      <div className="space-y-5">{props.children}</div>
    </main>
  );
}

function VisitorShell({ title, children, visitorTools }: Props) {
  return (
    <LegalShell title={title}>
      {visitorTools}
      {children}
    </LegalShell>
  );
}
