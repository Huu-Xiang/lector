import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import GlobalError from '@/app/global-error';
import RouteErrorView from './index';

describe('Route error boundaries', () => {
  it('renders RouteErrorView with retry and library links', () => {
    const html = renderToStaticMarkup(<RouteErrorView error={new Error('boom')} reset={vi.fn()} />);
    expect(html).toContain('title');
    expect(html).toContain('retry');
    expect(html).toContain('href="/"');
  });

  it('renders GlobalError standalone without any i18n provider', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error('root crash')} reset={vi.fn()} />,
    );
    expect(html).toContain('Something went wrong');
    expect(html).toContain('Reload');
    expect(html).toContain('href="/"');
  });
});
