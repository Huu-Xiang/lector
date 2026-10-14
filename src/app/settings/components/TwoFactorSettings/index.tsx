'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { useLectorMode } from '@/lib/use-env';

/**
 * TOTP two-factor authentication for the built-in accounts, so it renders in
 * cloud mode only (selfhost has no login to protect). Enrolment is
 * verify-to-arm: `enable` hands back the otpauth URI + backup codes, but the
 * account only starts demanding codes after the first one verifies — closing
 * the panel half-way never locks anyone out.
 */

type PasswordAction = 'enable' | 'disable' | 'regenerate';

/** Pull the base32 secret out of the otpauth:// URI for manual entry. */
function secretFromUri(totpURI: string): string {
  try {
    return new URL(totpURI).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
}

export default function TwoFactorSettings() {
  const t = useTranslations('settings.twoFactor');
  const mode = useLectorMode();
  const { data: session } = authClient.useSession();

  const [pendingAction, setPendingAction] = useState<PasswordAction | null>(null);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Enrolment payload from enable(): shown until verified or cancelled.
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [verifyCode, setVerifyCode] = useState('');

  if (mode !== 'cloud') return null;

  const enabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
  );

  function resetForms() {
    setPendingAction(null);
    setPassword('');
    setSubmitting(false);
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !pendingAction) return;
    setSubmitting(true);

    if (pendingAction === 'enable') {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error) {
        setSubmitting(false);
        toast.error(
          error.status === 400 ? t('wrongPassword') : (error.message ?? t('startFailed')),
        );
        return;
      }
      setTotpURI(data.totpURI);
      setBackupCodes(data.backupCodes);
      resetForms();
      return;
    }

    if (pendingAction === 'disable') {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) {
        setSubmitting(false);
        toast.error(
          error.status === 400 ? t('wrongPassword') : (error.message ?? t('disableFailed')),
        );
        return;
      }
      resetForms();
      setTotpURI(null);
      setBackupCodes(null);
      toast.success(t('toastOff'));
      return;
    }

    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
    if (error) {
      setSubmitting(false);
      toast.error(
        error.status === 400 ? t('wrongPassword') : (error.message ?? t('generateFailed')),
      );
      return;
    }
    setBackupCodes(data.backupCodes);
    resetForms();
    toast.success(t('toastNewCodes'));
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: verifyCode.trim() });
    setSubmitting(false);
    if (error) {
      toast.error(t('codeMismatch'));
      return;
    }
    // Session refetches via the auth client, flipping the section to "on".
    setTotpURI(null);
    setVerifyCode('');
    toast.success(t('toastOn'));
  }

  function copyBackupCodes() {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast.success(t('codesCopied'));
  }

  const enrolling = totpURI !== null;

  return (
    <section className="panel p-6" data-testid="twofactor-section">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{t('heading')}</h2>
        {!enabled && !enrolling && pendingAction === null && (
          <Button onClick={() => setPendingAction('enable')} data-testid="twofactor-enable">
            {t('enable')}
          </Button>
        )}
      </div>

      <p className="mb-4 text-sm text-muted-foreground">{t('intro')}</p>

      {!enrolling && (
        <p className="mb-4 text-sm text-foreground" data-testid="twofactor-status">
          {enabled ? t('statusOn') : t('statusOff')}
        </p>
      )}

      {/* Shared password confirmation for enable / disable / regenerate */}
      {pendingAction !== null && (
        <form
          onSubmit={handlePasswordSubmit}
          className="mb-4 space-y-3 rounded-md border border-border bg-muted p-4"
        >
          <Label htmlFor="twofactor-password">{t(`actions.${pendingAction}.title`)}</Label>
          <Input
            id="twofactor-password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="twofactor-password"
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={submitting || password.length === 0}
              variant={pendingAction === 'disable' ? 'destructive' : 'default'}
              data-testid="twofactor-password-submit"
            >
              {submitting ? t('working') : t(`actions.${pendingAction}.cta`)}
            </Button>
            <Button type="button" variant="outline" onClick={resetForms}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}

      {/* Enrolment: QR + manual secret + verify */}
      {enrolling && totpURI && (
        <div className="mb-4 space-y-4 rounded-md border border-border bg-muted p-4">
          <p className="text-sm font-medium text-foreground">{t('step1')}</p>
          <div className="flex justify-center">
            {/* White plate so the code scans in dark mode too */}
            <div className="rounded-lg bg-white p-3" data-testid="twofactor-qr">
              <QRCodeSVG value={totpURI} size={168} marginSize={0} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('cantScan')}{' '}
            <code
              className="rounded bg-background px-1.5 py-0.5 font-mono text-xs break-all select-all"
              data-testid="twofactor-secret"
            >
              {secretFromUri(totpURI)}
            </code>
          </p>

          <form onSubmit={handleVerify} className="space-y-2">
            <Label htmlFor="twofactor-verify-code">{t('step2')}</Label>
            <Input
              id="twofactor-verify-code"
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              data-testid="twofactor-verify-code"
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={submitting || verifyCode.trim().length < 6}
                data-testid="twofactor-verify-submit"
              >
                {submitting ? t('verifying') : t('verifyActivate')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  // Unverified setup never armed — safe to just close.
                  setTotpURI(null);
                  setBackupCodes(null);
                  setVerifyCode('');
                }}
              >
                {t('cancel')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* One-time backup codes display (enrolment and regeneration) */}
      {backupCodes && (
        <div className="mb-4 rounded-md border border-[var(--gold-lip)] bg-[var(--gold-soft)] p-4">
          <p className="mb-2 text-sm font-medium text-[var(--gold-strong)]">{t('saveCodes')}</p>
          <div
            className="mb-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-[var(--gold-lip)] bg-muted px-3 py-2 font-mono text-sm text-foreground sm:grid-cols-3"
            data-testid="twofactor-backup-codes"
          >
            {backupCodes.map((c) => (
              <span key={c} className="select-all">
                {c}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={copyBackupCodes}>{t('copy')}</Button>
            <Button
              variant="outline"
              onClick={() => setBackupCodes(null)}
              data-testid="twofactor-codes-saved"
            >
              {t('savedCodes')}
            </Button>
          </div>
        </div>
      )}

      {/* Management actions once armed */}
      {enabled && pendingAction === null && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setPendingAction('regenerate')}
            data-testid="twofactor-regenerate"
          >
            {t('newCodes')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => setPendingAction('disable')}
            data-testid="twofactor-disable"
          >
            {t('turnOff')}
          </Button>
        </div>
      )}
    </section>
  );
}
