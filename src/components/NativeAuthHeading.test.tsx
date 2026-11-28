import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import NativeAuthHeading from './NativeAuthHeading';

const layout = vi.hoisted(() => ({ nativePhone: false }));
vi.mock('@/lib/use-native-phone', () => ({
  useIsNativePhone: () => layout.nativePhone,
}));

describe('native auth heading hierarchy', () => {
  it('promotes the form title only in the native phone shell', () => {
    layout.nativePhone = true;
    expect(
      renderToStaticMarkup(<NativeAuthHeading className="title">Sign in</NativeAuthHeading>),
    ).toBe('<h1 class="title">Sign in</h1>');
  });

  it('preserves the subordinate heading beneath the web or iPad brand title', () => {
    layout.nativePhone = false;
    expect(
      renderToStaticMarkup(<NativeAuthHeading className="title">Sign in</NativeAuthHeading>),
    ).toBe('<h2 class="title">Sign in</h2>');
  });
});
