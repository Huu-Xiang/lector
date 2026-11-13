'use client';

import Link from 'next/link';
import { ChartBar, ChevronRight, Pencil, Settings, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AccountMenu from '@/components/NavHeader/components/AccountMenu';
import { authClient } from '@/lib/auth-client';

const destinations = [
  { href: '/stats', label: 'stats', icon: ChartBar },
  { href: '/journal', label: 'journal', icon: Pencil },
  { href: '/settings', label: 'settings', icon: Settings },
] as const;

export default function MePage() {
  const t = useTranslations('nav');
  const { data: session } = authClient.useSession();
  const name = session?.user.name?.trim();

  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 pt-5 pb-8">
      <header className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <UserRound size={24} aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">{t('me')}</h1>
          {name && <p className="text-sm break-words text-muted-foreground">{name}</p>}
        </div>
      </header>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {destinations.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-14 items-center gap-3 px-4 py-2 text-sm font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring active:bg-accent"
            >
              <Icon size={20} className="shrink-0 text-primary" aria-hidden />
              <span className="flex-1">{t(label)}</span>
              <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <AccountMenu compact showSignOutLabel />
    </main>
  );
}
