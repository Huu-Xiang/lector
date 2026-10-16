'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { maskEmail } from '@/lib/mask-email';
import { authClient } from '@/lib/auth-client';
import { useLectorMode } from '@/lib/use-env';
import SignOutButton from './components/SignOutButton';
import LegalLinks from '@/components/LegalLinks';

export default function AccountMenu({ compact = false }: { compact?: boolean }) {
  const mode = useLectorMode();

  if (mode !== 'cloud') {
    return null;
  }

  return <CloudAccountMenu compact={compact} />;
}

function CloudAccountMenu({ compact }: { compact: boolean }) {
  const { data: session } = authClient.useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const t = useTranslations('chrome.nav');

  if (!session) return null;

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      // Hard navigation so every in-memory state and cache resets with the session.
      window.location.assign('/login');
    }
  }

  if (compact) {
    return <SignOutButton compact onClick={handleSignOut} disabled={isSigningOut} />;
  }

  return (
    <div className="border-t border-border">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <p
            className="truncate text-sm font-medium text-foreground"
            title={session.user.name?.trim() || undefined}
            data-testid="account-name"
            data-email={session.user.email}
          >
            {session.user.name?.trim() || session.user.email}
          </p>
          <div className="flex items-center gap-1">
            <span
              className="min-w-0 truncate text-xs text-muted-foreground"
              data-testid="account-email-masked"
            >
              {showEmail ? session.user.email : maskEmail(session.user.email)}
            </span>
            <button
              type="button"
              onClick={() => setShowEmail((shown) => !shown)}
              aria-pressed={showEmail}
              aria-label={showEmail ? t('hideEmail') : t('showEmail')}
              title={showEmail ? t('hideEmail') : t('showEmail')}
              data-testid="account-email-toggle"
              className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {showEmail ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
        </div>
        <SignOutButton onClick={handleSignOut} disabled={isSigningOut} />
      </div>
      <LegalLinks layout="start" className="px-4 pb-3" />
    </div>
  );
}
