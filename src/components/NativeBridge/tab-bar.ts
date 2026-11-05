import { navLinks } from '@/components/NavHeader/constants';

/** The app's tab bar keeps five tabs; Settings moves to the top bar. */
export const NATIVE_TABS = navLinks.filter((link) => link.href !== '/settings');

/** Filled SF Symbols for each tab, as the HIG prefers; keys match `navLinks`. */
export const TAB_ICONS: Record<string, string> = {
  '/': 'books.vertical.fill',
  '/practice': 'rectangle.stack.fill',
  '/journal': 'square.and.pencil',
  '/vocab': 'list.bullet.rectangle.fill',
  '/stats': 'chart.bar.fill',
};

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
