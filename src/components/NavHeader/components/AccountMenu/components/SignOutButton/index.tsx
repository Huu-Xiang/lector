import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LogOut } from 'lucide-react';
import { ISignOutButtonProps } from './types';

export default function SignOutButton({
  disabled,
  onClick,
  compact = false,
  showLabel = false,
}: ISignOutButtonProps) {
  const t = useTranslations('chrome.nav');
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={t('signOut')}
      data-testid="account-sign-out"
      className={cn(
        'rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        !compact && 'shrink-0',
        showLabel && 'inline-flex min-h-11 items-center gap-2 px-4 text-sm font-medium',
      )}
    >
      <LogOut className="h-4 w-4" aria-hidden />
      {showLabel && t('signOut')}
    </button>
  );
}
