import { describe, expect, it } from 'vitest';
import { navLinks } from '@/components/NavHeader/constants';
import { coversTabBar, hasOwnHeader, TAB_ICONS } from './tab-bar';

function element(opts: { hiddenAncestor?: boolean; rendered?: boolean }) {
  return {
    closest: () => (opts.hiddenAncestor ? {} : null),
    getClientRects: () => ({ length: opts.rendered === false ? 0 : 1 }),
  };
}

function root(...elements: ReturnType<typeof element>[]) {
  return { querySelectorAll: () => elements } as unknown as ParentNode;
}

describe('coversTabBar', () => {
  it('is true while a dialog is shown', () => {
    expect(coversTabBar(root(element({})))).toBe(true);
  });

  it('ignores closed sheets and dialogs that are not rendered', () => {
    expect(coversTabBar(root())).toBe(false);
    expect(coversTabBar(root(element({ hiddenAncestor: true })))).toBe(false);
    expect(coversTabBar(root(element({ rendered: false })))).toBe(false);
  });
});

describe('TAB_ICONS', () => {
  it('has an icon for every tab', () => {
    for (const link of navLinks) expect(TAB_ICONS[link.href]).toBeTruthy();
  });
});

describe('hasOwnHeader', () => {
  it('is true for the reader only', () => {
    expect(hasOwnHeader('/read/abc')).toBe(true);
    expect(hasOwnHeader('/')).toBe(false);
    expect(hasOwnHeader('/practice')).toBe(false);
  });
});
