'use client';

import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE } from '@/i18n/locales';

export default function BookHubLocaleButton({ code, label }: { code: string; label: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      lang={code}
      className="cursor-pointer underline hover:text-foreground"
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
