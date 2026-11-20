'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Root-level fallback when RootLayout itself fails. Must stay completely
 * self-contained (no NextIntlClientProvider, no theme script) so it can never
 * crash while rendering the recovery UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#f3eee3',
          color: '#1f1b16',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ margin: 0, maxWidth: '26rem', fontSize: '0.9rem', opacity: 0.75 }}>
          An unexpected error occurred while loading Readfox.
        </p>
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#2d6a4f',
              color: '#ffffff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {/* Hard navigation is intentional when RootLayout itself has crashed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(0,0,0,0.15)',
              color: 'inherit',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Back to library
          </a>
        </div>
      </body>
    </html>
  );
}
