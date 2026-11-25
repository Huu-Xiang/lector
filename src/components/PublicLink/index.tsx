import type { ComponentProps } from 'react';
import Link from 'next/link';
import { localizePublicPath } from '@/lib/public-locale';
import { activePublicLocalePrefix } from '@/lib/public-locale.server';

export default async function PublicLink({ href, ...rest }: ComponentProps<typeof Link>) {
  const prefix = await activePublicLocalePrefix();
  const localized = typeof href === 'string' ? localizePublicPath(href, prefix) : href;
  return <Link href={localized} {...rest} />;
}
