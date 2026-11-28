import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const layout = vi.hoisted(() => ({ size: 'xs', ipad: false }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ number: (value: number) => String(value) }),
  useLocale: () => 'en',
}));
vi.mock('@/utils/hooks', () => ({ useIsDark: () => false, useScreenSize: () => layout.size }));
vi.mock('@/components/NativeBridge/ipad-layout', () => ({ isIPadApp: () => layout.ipad }));

import VocabGrowthChart from './index';

describe('native sparse vocabulary growth', () => {
  beforeEach(() => {
    layout.size = 'xs';
    layout.ipad = false;
  });
  it('uses a milestone with proportional tracked states without losing new words from total', () => {
    const markup = renderToStaticMarkup(
      <VocabGrowthChart compact data={[{ date: '2026-11-27', known: 3, learning: 1, total: 6 }]} />,
    );
    expect(markup).toContain('vocab-growth-sparse');
    expect(markup).toContain('width:75%');
    expect(markup).toContain('width:25%');
    expect(markup).toContain('>6</p>');
    expect(markup).toContain('growthHint');
    expect(markup).not.toContain('recharts-responsive-container');
  });
  it('handles a saved-only snapshot with no divide-by-zero', () => {
    const markup = renderToStaticMarkup(
      <VocabGrowthChart compact data={[{ date: '2026-11-27', known: 0, learning: 0, total: 2 }]} />,
    );
    expect(markup).toContain('vocab-growth-sparse');
    expect(markup).not.toMatch(/NaN|Infinity/);
  });
  it('uses live totals when a selected range has no dated points', () => {
    expect(
      renderToStaticMarkup(
        <VocabGrowthChart compact data={[]} totals={{ known: 4, learning: 2, total: 6 }} />,
      ),
    ).toContain('vocab-growth-sparse');
    expect(renderToStaticMarkup(<VocabGrowthChart compact data={[]} />)).toContain(
      'noTrackedWords',
    );
  });
  it('preserves chart rendering on desktop, iPad, and multi-day histories', () => {
    const points = [{ date: '2026-11-27', known: 3, learning: 1, total: 4 }];
    layout.size = 'sm';
    expect(renderToStaticMarkup(<VocabGrowthChart compact data={points} />)).not.toContain(
      'vocab-growth-sparse',
    );
    layout.size = 'xs';
    layout.ipad = true;
    expect(renderToStaticMarkup(<VocabGrowthChart compact data={points} />)).not.toContain(
      'vocab-growth-sparse',
    );
    layout.ipad = false;
    expect(
      renderToStaticMarkup(
        <VocabGrowthChart compact data={[...points, { ...points[0], date: '2026-11-28' }]} />,
      ),
    ).not.toContain('vocab-growth-sparse');
  });
});
