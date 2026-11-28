import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import VocabTestShell, { VocabLanguageTabsVisibility, VocabVisitorOnly } from './VocabTestShell';

const state = vi.hoisted(() => ({
  native: false,
  mode: 'selfhost',
  session: vi.fn(() => ({ data: null })),
}));
vi.mock('@/lib/native-app', () => ({ useIsNativeApp: () => state.native, haptic: vi.fn() }));
vi.mock('@/lib/use-env', () => ({ useLectorMode: () => state.mode }));
vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: state.session } }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}));
vi.mock('@/components/PageHeader', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/LegalLinks/shell', () => ({
  LegalShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="legal-shell">{children}</div>
  ),
}));

afterEach(() => {
  state.native = false;
  state.mode = 'selfhost';
  state.session.mockClear();
  vi.unstubAllGlobals();
});

describe('native vocabulary shell', () => {
  for (const mode of ['cloud', 'selfhost']) {
    it(`bypasses the visitor marketing shell without a session in ${mode}`, () => {
      state.native = true;
      state.mode = mode;
      vi.stubGlobal('window', { location: { search: '?from=setup' } });
      const html = renderToStaticMarkup(
        <VocabTestShell title="Marketing title" visitorTools={<p>Language chooser</p>}>
          <p>Test intro</p>
        </VocabTestShell>,
      );
      expect(html).toContain('vocab-test-workspace');
      expect(html).toContain('href="/setup"');
      expect(html).toContain('Test intro');
      expect(html).not.toContain('Marketing title');
      expect(html).not.toContain('Language chooser');
      expect(html).not.toContain('legal-shell');
      expect(state.session).not.toHaveBeenCalled();
    });
  }

  it('keeps native setup focused and navigation language switching available', () => {
    state.native = true;
    vi.stubGlobal('window', { location: { search: '?from=setup' } });
    expect(
      renderToStaticMarkup(
        <VocabLanguageTabsVisibility>Language tabs</VocabLanguageTabsVisibility>,
      ),
    ).toBe('');
    expect(renderToStaticMarkup(<VocabVisitorOnly>SEO content</VocabVisitorOnly>)).toBe('');
    vi.stubGlobal('window', { location: { search: '?from=nav' } });
    expect(
      renderToStaticMarkup(
        <VocabLanguageTabsVisibility>Language tabs</VocabLanguageTabsVisibility>,
      ),
    ).toBe('Language tabs');
  });

  it('retains visitor content during non-native server rendering', () => {
    const html = renderToStaticMarkup(
      <VocabTestShell title="Marketing title">
        <p>Test intro</p>
      </VocabTestShell>,
    );
    expect(html).toContain('legal-shell');
    expect(html).toContain('Test intro');
    expect(renderToStaticMarkup(<VocabVisitorOnly>SEO content</VocabVisitorOnly>)).toBe(
      'SEO content',
    );
  });
});
