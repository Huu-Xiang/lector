import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import LandingReaderDemo, { SAMPLES } from './index';

describe('LandingReaderDemo', () => {
  it('renders an interactive zero-API sample passage with an initial gloss card', () => {
    const html = renderToStaticMarkup(<LandingReaderDemo />);

    expect(html).toContain('data-testid="landing-reader-demo"');
    expect(html).toContain('Le Petit Prince');
    expect(html).toContain('data-testid="landing-demo-gloss"');
    expect(html).toContain('clearly / well');
    expect(html).toContain('href="/books"');
  });

  it('points every sample defaultIndex at a glossed word token', () => {
    for (const sample of SAMPLES) {
      const token = sample.tokens[sample.defaultIndex];
      expect(token, `${sample.id} defaultIndex ${sample.defaultIndex}`).toBeDefined();
      expect(token.gloss, `${sample.id} token "${token.text}"`).toBeTruthy();
    }
  });
});
