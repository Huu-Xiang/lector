import { describe, expect, it } from 'vitest';
import { coversTabBar, hasOwnHeader, NATIVE_TABS, TAB_ICONS } from './tab-bar';

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

describe('NATIVE_TABS', () => {
  it('keeps five tabs, each with an icon, and leaves Settings to the top bar', () => {
    expect(NATIVE_TABS).toHaveLength(5);
    expect(NATIVE_TABS.map((link) => link.href as string)).not.toContain('/settings');
    for (const link of NATIVE_TABS) expect(TAB_ICONS[link.href]).toBeTruthy();
  });
});

describe('hasOwnHeader', () => {
  it('is true for the reader only', () => {
    expect(hasOwnHeader('/read/abc')).toBe(true);
    expect(hasOwnHeader('/')).toBe(false);
    expect(hasOwnHeader('/practice')).toBe(false);
  });
});
