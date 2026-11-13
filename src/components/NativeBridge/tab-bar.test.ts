import { describe, expect, it } from 'vitest';
import {
  coversTabBar,
  hasOwnHeader,
  nativeTabs,
  parseOptionalTab,
  selectedNativeTab,
} from './tab-bar';

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

describe('nativeTabs', () => {
  it('defaults to four tabs with Me last', () => {
    expect(nativeTabs(parseOptionalTab(null)).map((tab) => tab.href)).toEqual([
      '/',
      '/vocab',
      '/stats',
      '/me',
    ]);
    expect(parseOptionalTab('unexpected')).toBe('none');
  });

  it('adds one shortcut without losing access to the other pages under Me', () => {
    expect(nativeTabs('journal').map((tab) => tab.href)).toEqual([
      '/',
      '/vocab',
      '/stats',
      '/journal',
      '/me',
    ]);
    expect(selectedNativeTab('/journal', 'journal')).toBe('/journal');
    expect(selectedNativeTab('/journal', 'practice')).toBe('/me');
    expect(selectedNativeTab('/stats', 'none')).toBe('/stats');
    expect(parseOptionalTab('stats')).toBe('none');
    expect(selectedNativeTab('/practice', 'none')).toBe('/me');
    expect(selectedNativeTab('/collection/book', 'none')).toBe('/');
    expect(selectedNativeTab('/settings', 'none')).toBe('/me');
    expect(selectedNativeTab('/read/book', 'none')).toBeNull();
  });
});

describe('hasOwnHeader', () => {
  it('is true for the reader only', () => {
    expect(hasOwnHeader('/read/abc')).toBe(true);
    expect(hasOwnHeader('/')).toBe(false);
    expect(hasOwnHeader('/practice')).toBe(false);
  });
});
