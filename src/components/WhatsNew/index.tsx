'use client';

import { Megaphone, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { authClient } from '@/lib/auth-client';
import { useAnnouncements } from '@/lib/use-announcements';
import { useLectorMode } from '@/lib/use-env';
import { cn } from '@/lib/utils';
import { IWhatsNewProps } from './types';

export default function WhatsNew(props: IWhatsNewProps) {
  const mode = useLectorMode();
  if (mode !== 'cloud') return null;
  return <CloudWhatsNew {...props} />;
}

function CloudWhatsNew({ variant, collapsed = false }: IWhatsNewProps) {
  const { data: session } = authClient.useSession();
  if (!session) return null;
  return (
    <WhatsNewPanel
      variant={variant}
      collapsed={collapsed}
      signedUpAt={new Date(session.user.createdAt).getTime()}
    />
  );
}

function WhatsNewPanel({
  variant,
  collapsed,
  signedUpAt,
}: IWhatsNewProps & { signedUpAt: number }) {
  const t = useTranslations('announcements');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const { list, unseen, markSeen } = useAnnouncements(signedUpAt);

  if (list.length === 0) return null;

  const iconOnly = variant === 'topbar' || collapsed;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          markSeen();
        }}
        aria-label={unseen > 0 ? t('buttonUnseen') : t('button')}
        title={t('button')}
        data-testid="whats-new-button"
        className={cn(
          'relative flex items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          iconOnly ? 'justify-center p-2' : 'w-full gap-3 px-3 py-2',
        )}
      >
        <Megaphone className="h-4 w-4 shrink-0" aria-hidden="true" />
        {!iconOnly && <span>{t('button')}</span>}
        {unseen > 0 && (
          <span
            data-testid="whats-new-dot"
            aria-hidden="true"
            className={cn(
              'size-2 rounded-full bg-primary',
              iconOnly ? 'absolute top-1.5 right-1.5' : 'ml-auto',
            )}
          />
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogClose
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
              aria-label={t('close')}
            >
              <X className="h-5 w-5" />
            </DialogClose>
          </div>
          <ul className="space-y-3 overflow-y-auto px-6 py-4" data-testid="whats-new-list">
            {list.map((entry) => (
              <li
                key={entry.id}
                data-testid={`whats-new-${entry.id}`}
                className="rounded-xl border border-border bg-card p-4"
              >
                <p className="text-xs text-muted-foreground">
                  {format.dateTime(new Date(entry.date), { dateStyle: 'medium', timeZone: 'UTC' })}
                </p>
                <h3 className="mt-0.5 font-semibold text-foreground">
                  {t(`items.${entry.id}.title`)}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(`items.${entry.id}.body`)}</p>
                {entry.href && (
                  <Link
                    href={entry.href}
                    onClick={() => setOpen(false)}
                    className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                  >
                    {t('learnMore')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
