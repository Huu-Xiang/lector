'use client';

import type { ComponentProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { localizePublicPath, publicLocalePrefixFromPath } from '@/lib/public-locale';

export function ClientPublicLink({
  href,
  localePrefix,
  ...rest
}: ComponentProps<typeof Link> & { localePrefix?: string }) {
  const pathname = usePathname();
  const prefix = localePrefix ?? publicLocalePrefixFromPath(pathname);
  const localized = typeof href === 'string' ? localizePublicPath(href, prefix) : href;
  return <Link href={localized} {...rest} />;
}
