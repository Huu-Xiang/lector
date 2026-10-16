'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import TurnstileWidget, { turnstileSiteKey } from '@/components/TurnstileWidget';
import PasswordMeter from '@/components/PasswordMeter';
import { authClient } from '@/lib/auth-client';
import { authHref, sanitizeAuthReturnPath } from '@/lib/auth-return';
import { meetsRules } from '@/lib/password-strength';

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const t = useTranslations('auth.register');
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const returnPath = sanitizeAuthReturnPath(params.get('next'));
  const destination = returnPath ?? '/';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaRound, setCaptchaRound] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && session) router.replace(destination);
  }, [destination, isPending, session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!meetsRules(password)) {
      toast.error(t('errWeak'));
      return;
    }
    if (password !== confirm) {
      toast.error(t('errMismatch'));
      return;
    }
    setSubmitting(true);

    const { error } = await authClient.signUp.email({
      name: name.trim() || email.split('@')[0],
      email,
      password,
      // Absolute: the verification link lives on the API origin and redirects
      // here after confirming; a bare '/' would resolve against the API.
      callbackURL: `${window.location.origin}${destination}`,
      fetchOptions: {
        headers: captchaToken ? { 'x-captcha-response': captchaToken } : {},
      },
    });

    setSubmitting(false);
    if (error) {
      setCaptchaToken('');
      setCaptchaRound((r) => r + 1);
      toast.error(error.message ?? t('errFailed'));
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="space-y-4" data-testid="register-check-email">
        <h2 className="text-lg font-semibold text-foreground">{t('checkTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t.rich('checkBody', {
            email: sentTo,
            b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          })}
        </p>
        <Button className="w-full" onClick={() => router.push(authHref('/login', returnPath))}>
          {t('goSignIn')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>

      <div className="space-y-2">
        <Label htmlFor="name">{t('name')}</Label>
        <Input
          id="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="register-name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="register-email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="register-password"
        />
        <PasswordMeter password={password} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
        <Input
          id="confirm-password"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={confirm.length > 0 && confirm !== password}
          data-testid="register-confirm-password"
        />
        {confirm.length > 0 && (
          <p
            className={`text-xs ${confirm === password ? 'text-primary' : 'text-destructive'}`}
            data-testid="register-confirm-hint"
          >
            {confirm === password ? t('matches') : t('errMismatch')}
          </p>
        )}
      </div>

      <TurnstileWidget key={captchaRound} onToken={setCaptchaToken} />

      <Button
        type="submit"
        className="w-full"
        disabled={
          submitting ||
          !meetsRules(password) ||
          password !== confirm ||
          (!!turnstileSiteKey() && !captchaToken)
        }
        data-testid="register-submit"
      >
        {submitting ? t('submitting') : t('submit')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t('haveAccount')}{' '}
        <Link
          href={authHref('/login', returnPath)}
          className="font-medium text-primary hover:underline"
        >
          {t('signIn')}
        </Link>
      </p>
    </form>
  );
}
