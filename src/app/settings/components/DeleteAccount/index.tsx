'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { useLectorMode } from '@/lib/use-env';

/**
 * Danger zone — permanent account + data deletion (#227, right-to-erasure).
 * Cloud-mode only: self-host runs as a single implicit local user with no
 * account to delete (mirrors AccountMenu's gate). This only KICKS OFF the flow
 * — Better Auth emails a confirmation link (deleteUser +
 * sendDeleteAccountVerification, api/src/lib/accounts.ts) and the tenant's data
 * is erased only when that link is clicked, so it works for password and
 * OAuth/OIDC accounts alike.
 */
const CONFIRM_PHRASE = 'DELETE';

export default function DeleteAccount() {
  const mode = useLectorMode();
  if (mode !== 'cloud') return null;
  return <DeleteAccountCard />;
}

function DeleteAccountCard() {
  const t = useTranslations('settings.deleteAccount');
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const confirmed = phrase.trim() === CONFIRM_PHRASE;

  async function handleDelete() {
    if (submitting || !confirmed) return;
    setSubmitting(true);
    const { error } = await authClient.deleteUser({
      callbackURL: `${window.location.origin}/login?deleted=1`,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message ?? t('startFailed'));
      return;
    }
    setSent(true);
  }

  return (
    <section
      className="rounded-lg border border-destructive/40 bg-card p-6"
      data-testid="delete-account"
    >
      <h2 className="mb-2 text-lg font-semibold text-destructive">{t('heading')}</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {t.rich('intro', { strong: (chunks) => <strong>{chunks}</strong> })}
      </p>
      <p className="mb-4 text-sm text-muted-foreground">
        {t.rich('billingWarning', { strong: (chunks) => <strong>{chunks}</strong> })}
      </p>

      {sent ? (
        <div
          className="rounded-lg border border-border bg-[var(--primary-soft)] p-3 text-sm text-foreground"
          data-testid="delete-account-sent"
        >
          {t.rich('sent', { strong: (chunks) => <strong>{chunks}</strong> })}
        </div>
      ) : !open ? (
        <Button
          variant="destructive"
          onClick={() => setOpen(true)}
          data-testid="delete-account-start"
        >
          {t('start')}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">
              {t.rich('typeToConfirm', {
                phrase: CONFIRM_PHRASE,
                mono: (chunks) => <span className="font-mono font-semibold">{chunks}</span>,
              })}
            </Label>
            <Input
              id="delete-confirm"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              data-testid="delete-account-confirm-input"
            />
          </div>
          <div className="flex gap-3">
            <Button
              variant="destructive"
              disabled={submitting || !confirmed}
              onClick={handleDelete}
              data-testid="delete-account-confirm"
            >
              {submitting ? t('sending') : t('confirm')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setPhrase('');
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
