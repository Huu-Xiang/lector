'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LOCALE_COOKIE } from '@/i18n/locales';
import { localizePublicPath } from '@/lib/public-locale';

export default function BookHubLocaleButton({ code, label }: { code: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <button
      type="button"
      lang={code}
      className="cursor-pointer underline hover:text-foreground"
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
        if (pathname) {
          const nextPath = localizePublicPath(pathname, code);
          if (nextPath !== pathname) {
            const suffix =
              typeof window !== 'undefined'
                ? `${window.location.search}${window.location.hash}`
                : '';
            router.push(`${nextPath}${suffix}`);
            return;
          }
        }
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
