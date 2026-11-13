const library = { href: '/', labelKey: 'library', icon: 'books.vertical.fill' } as const;
const stats = { href: '/stats', labelKey: 'stats', icon: 'chart.bar.fill' } as const;
const vocab = { href: '/vocab', labelKey: 'vocab', icon: 'list.bullet.rectangle.fill' } as const;
export const ME_TAB = { href: '/me', labelKey: 'me', icon: 'person.crop.circle.fill' } as const;

export const OPTIONAL_TABS = {
  journal: { href: '/journal', labelKey: 'journal', icon: 'square.and.pencil' },
  practice: { href: '/practice', labelKey: 'practice', icon: 'rectangle.stack.fill' },
} as const;

export type OptionalTab = 'none' | keyof typeof OPTIONAL_TABS;

export function parseOptionalTab(value: string | null): OptionalTab {
  return value === 'journal' || value === 'practice' ? value : 'none';
}

export function nativeTabs(extra: OptionalTab) {
  return [library, vocab, stats, ...(extra === 'none' ? [] : [OPTIONAL_TABS[extra]]), ME_TAB];
}

export function selectedNativeTab(pathname: string, extra: OptionalTab): string | null {
  if (pathname.startsWith('/collection/')) return library.href;
  if (nativeTabs(extra).some((tab) => tab.href === pathname)) return pathname;
  if (
    pathname === '/settings' ||
    Object.values(OPTIONAL_TABS).some((tab) => tab.href === pathname)
  ) {
    return ME_TAB.href;
  }
  return null;
}

const COVER_SELECTOR = '[role="dialog"], [role="alertdialog"], [data-slot="dialog-content"]';

/**
 * True while a sheet or dialog is open. The native tab bar sits above the web view,
 * so it hides then, or it would cover the sheet's lower edge.
 */
export function coversTabBar(root: ParentNode): boolean {
  return Array.from(root.querySelectorAll(COVER_SELECTOR)).some(
    (el) => !el.closest('[aria-hidden="true"], [hidden]') && el.getClientRects().length > 0,
  );
}

/** The reader draws its own header and wants the whole screen, so the app bars step aside. */
export function hasOwnHeader(pathname: string): boolean {
  return pathname.startsWith('/read/');
}
