import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/show-descriptions', () => ({
  useShowDescriptions: () => [true, vi.fn()],
}));

import DescriptionToggle from './index';

describe('DescriptionToggle', () => {
  it('renders a label wrapping a switch button and plain text span without duplicate click handlers', () => {
    const markup = renderToStaticMarkup(<DescriptionToggle />);

    expect(markup).toContain('<label');
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('aria-label="toggle"');
    expect(markup).toContain('<span>toggle</span>');
  });
});
