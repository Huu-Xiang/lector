'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import TurnstileWidget, { turnstileSiteKey } from '@/components/TurnstileWidget';
import { authClient } from '@/lib/auth-client';
import { authHref, sanitizeAuthReturnPath } from '@/lib/auth-return';

/**
 * Two forms on one route (#218):
 *   - no ?token → request a reset link (email form)
 *   - ?token=… → set a new password (the emailed link redirects back here
 *     with the token; better-auth appends ?error=… on an invalid/expired one)
 */
export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary for prerendering.
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const t = useTranslations('auth.reset');
  const params = useSearchParams();
  const token = params.get('token');
  const linkError = params.get('error');
  const returnPath = sanitizeAuthReturnPath(params.get('next'));

  if (linkError) {
    return (
      <div className="space-y-4" data-testid="reset-link-invalid">
        <h2 className="text-lg font-semibold text-foreground">{t('expiredTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('expiredBody')}</p>
        <Button
          className="w-full"
          onClick={() => window.location.assign(authHref('/reset-password', returnPath))}
        >
          {t('requestNew')}
        </Button>
      </div>
    );
  }

  return token ? (
    <NewPasswordForm token={token} returnPath={returnPath} />
  ) : (
    <RequestResetForm returnPath={returnPath} />
  );
}

function RequestResetForm({ returnPath }: { returnPath: string | null }) {
  const t = useTranslations('auth.reset');
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaRound, setCaptchaRound] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}${authHref('/reset-password', returnPath)}`,
      fetchOptions: {
        headers: captchaToken ? { 'x-captcha-response': captchaToken } : {},
      },
    });

    setSubmitting(false);
    if (error) {
      setCaptchaToken('');
      setCaptchaRound((r) => r + 1);
      toast.error(error.message ?? t('errRequest'));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4" data-testid="reset-check-email">
        <h2 className="text-lg font-semibold text-foreground">{t('checkTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t.rich('checkBody', {
            email,
            b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          })}
        </p>
        <Link href={authHref('/login', returnPath)} className="block">
          <Button className="w-full">{t('backToSignIn')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>

      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="reset-email"
        />
      </div>

      <TurnstileWidget key={captchaRound} onToken={setCaptchaToken} />

      <Button
        type="submit"
        className="w-full"
        disabled={submitting || (!!turnstileSiteKey() && !captchaToken)}
        data-testid="reset-submit"
      >
        {submitting ? t('sending') : t('send')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href={authHref('/login', returnPath)}
          className="font-medium text-primary hover:underline"
        >
          {t('backToSignIn')}
        </Link>
      </p>
    </form>
  );
}

function NewPasswordForm({ token, returnPath }: { token: string; returnPath: string | null }) {
  const t = useTranslations('auth.reset');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const { error } = await authClient.resetPassword({ newPassword: password, token });

    setSubmitting(false);
    if (error) {
      toast.error(error.message ?? t('errReset'));
      return;
    }
    toast.success(t('updated'));
    router.replace(authHref('/login', returnPath));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{t('newTitle')}</h2>

      <div className="space-y-2">
        <Label htmlFor="new-password">{t('newPassword')}</Label>
        <Input
          id="new-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="reset-new-password"
        />
        <p className="text-xs text-muted-foreground">{t('passwordHint')}</p>
      </div>

      <Button type="submit" className="w-full" disabled={submitting} data-testid="reset-confirm">
        {submitting ? t('updating') : t('setNew')}
      </Button>
    </form>
  );
}
