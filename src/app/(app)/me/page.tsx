'use client';

import Link from 'next/link';
import {
  ChartBar,
  Clipboard,
  ChevronRight,
  Gauge,
  List,
  Pencil,
  Settings,
  UserRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import AccountMenu from '@/components/NavHeader/components/AccountMenu';
import { authClient } from '@/lib/auth-client';
import { useIsNativeApp } from '@/lib/native-app';

const destinations = [
  {
    href: '/vocab',
    label: 'vocab',
    tint: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
    icon: List,
  },
  {
    href: '/vocab-test?from=nav',
    label: 'vocabTest',
    tint: 'bg-purple-500/12 text-purple-600 dark:text-purple-400',
    icon: Gauge,
  },
  {
    href: '/practice',
    label: 'practice',
    tint: 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
    icon: Clipboard,
  },
  {
    href: '/stats',
    label: 'stats',
    tint: 'bg-green-500/12 text-green-600 dark:text-green-400',
    icon: ChartBar,
  },
  {
    href: '/journal',
    label: 'journal',
    tint: 'bg-pink-500/12 text-pink-600 dark:text-pink-400',
    icon: Pencil,
  },
  {
    href: '/settings',
    label: 'settings',
    tint: 'bg-slate-500/12 text-slate-600 dark:text-slate-400',
    icon: Settings,
  },
] as const;

export default function MePage() {
  const t = useTranslations('nav');
  const nativeApp = useIsNativeApp();
  const vocabTest = useTranslations('vocabTest');
  const { data: session } = authClient.useSession();
  const name = session?.user.name?.trim();

  return (
    <main className="native-compact-page mx-auto w-full max-w-xl space-y-5 px-4 pt-5 pb-8">
      <div className="flex items-center gap-3">
        <div className="me-avatar grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <UserRound size={24} aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="native-page-title text-2xl font-extrabold">{t('me')}</h1>
          {name && (
            <p className="native-subtitle text-sm break-words text-muted-foreground">{name}</p>
          )}
        </div>
      </div>
      <ul
        className={
          nativeApp
            ? 'overflow-hidden rounded-2xl border border-border/60 bg-card sm:divide-y sm:divide-border sm:border-border [&>li+li]:relative [&>li+li]:before:absolute [&>li+li]:before:inset-x-4 [&>li+li]:before:ms-10 [&>li+li]:before:border-t [&>li+li]:before:border-border/60 sm:[&>li+li]:before:hidden'
            : 'divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card'
        }
      >
        {destinations.map(({ href, label, icon: Icon, tint }) => (
          <li key={href}>
            <Link
              href={href}
              className={`me-link flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring active:bg-accent ${nativeApp ? 'text-[17px] font-medium sm:text-sm sm:font-semibold' : 'text-sm font-semibold'}`}
            >
              {nativeApp ? (
                <span
                  className={`me-icon grid size-7 shrink-0 place-items-center rounded-[7px] sm:size-5 sm:rounded-none sm:bg-transparent sm:text-primary dark:sm:text-primary ${tint}`}
                >
                  <Icon size={18} className="sm:size-5" aria-hidden />
                </span>
              ) : (
                <Icon size={20} className="shrink-0 text-primary" aria-hidden />
              )}
              <span className="flex-1">
                {label === 'vocabTest' ? vocabTest('navLink') : t(label)}
              </span>
              <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <AccountMenu compact showSignOutLabel />
    </main>
  );
}
