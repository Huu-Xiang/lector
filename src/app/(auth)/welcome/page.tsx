'use client';

import { Suspense, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import styles from './welcome.module.css';
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
    <main className={styles.welcome}>
      <div className={styles.brand}>
        <Image src="/logo.png" alt="" width={32} height={32} className="rounded-lg" />
        {common('appName')}
      </div>

      <div className={styles.intro}>
        <h1>{t('welcome.title')}</h1>
        <p>{t('welcome.description')}</p>
      </div>

      <div className={styles.preview}>
        <Image
          src="/library-covers/en/a-little-princess.webp"
          alt=""
          width={480}
          height={640}
          sizes="(min-width: 768px) 210px, 150px"
          className={styles.cover}
        />
        <div className={styles.sample}>
          <p className={styles.bookTitle} lang="en">
            A Little Princess
          </p>
          <blockquote lang="en">
            She sat with her feet <mark>tucked</mark> under her…
          </blockquote>
          <div className={styles.gloss}>
            <span>{t('welcome.inContext')}</span>
            <p>{t('welcome.gloss')}</p>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Link
          href={authHref('/register', next)}
          className={cn(buttonVariants({ size: 'lg' }), styles.start)}
        >
          {t('register.submit')}
          <ArrowRight size={18} aria-hidden="true" className="absolute end-4" />
        </Link>
        <Link
          href={authHref('/login', next)}
          className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), styles.signIn)}
        >
          {t('login.title')}
        </Link>
      </div>
    </main>
  );
}
