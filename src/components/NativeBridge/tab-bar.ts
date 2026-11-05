/** SF Symbols for each tab; keys match `navLinks`. */
export const TAB_ICONS: Record<string, string> = {
  '/': 'books.vertical',
  '/practice': 'rectangle.stack',
  '/journal': 'square.and.pencil',
  '/vocab': 'list.bullet',
  '/stats': 'chart.bar',
  '/settings': 'gearshape',
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
