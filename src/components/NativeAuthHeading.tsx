'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { useIsNativePhone } from '@/lib/use-native-phone';

export default function NativeAuthHeading(props: ComponentPropsWithoutRef<'h1'>) {
  const nativePhone = useIsNativePhone();
  const Heading = nativePhone ? 'h1' : 'h2';
  return <Heading {...props} />;
}
