'use client';

import { Suspense, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { authHref, sanitizeAuthReturnPath } from '@/lib/auth-return';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

export default function WelcomePage() {
  return (
    <Suspense>
      <Welcome />
    </Suspense>
  );
}

function Welcome() {
  const t = useTranslations('auth');
  const common = useTranslations('common');
  const router = useRouter();
  const params = useSearchParams();
  const next = sanitizeAuthReturnPath(params.get('next'));
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (session) router.replace(next ?? '/');
  }, [session, next, router]);

  return (
    <main className="mx-auto flex min-h-[70svh] w-full max-w-sm flex-col justify-center gap-10 px-6 py-8">
      <div className="space-y-3 text-center">
        <Image
          src="/logo.png"
          alt=""
          width={104}
          height={104}
          priority
          className="mx-auto rounded-3xl"
        />
        <h1 className="text-4xl font-extrabold tracking-tight">{common('appName')}</h1>
        <p className="mx-auto max-w-56 text-balance text-muted-foreground">{common('tagline')}</p>
      </div>
      <div className="grid gap-3">
        <Link
          href={authHref('/register', next)}
          className={cn(buttonVariants({ size: 'lg' }), 'min-h-12')}
        >
          {t('register.submit')}
        </Link>
        <Link
          href={authHref('/login', next)}
          className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'min-h-12')}
        >
          {t('login.title')}
        </Link>
      </div>
    </main>
  );
}
