export type MessageTree = { [key: string]: string | MessageTree };

/**
 * Top-level i18n namespaces serialized by RootLayout for public, auth, legal,
 * billing, and shared shell chrome. Kept intentionally lean so landing, login,
 * and free-book pages never pay for the heavy app-only catalogs.
 */
export const SHELL_AND_PUBLIC_NAMESPACES = [
  'alternatives',
  'auth',
  'betaNotice',
  'bookLink',
  'checkoutPage',
  'chrome',
  'common',
  'descriptions',
  'landing',
  'legal',
  'legalPages',
  'nav',
  'plans',
  'pricing',
  'publicBooks',
  'refund',
  'subscribe',
  'uiLanguage',
  'vocabTest',
  'welcomeOffer',
] as const;

/**
 * Heavy namespaces needed only inside the authenticated/core application under
 * `src/app/(app)/layout.tsx`.
 */
export const APP_ONLY_NAMESPACES = [
  'announcements',
  'chat',
  'dailyGoal',
  'feedback',
  'journal',
  'library',
  'newLanguage',
  'planLimits',
  'practice',
  'reader',
  'readingLevel',
  'recommend',
  'settings',
  'setup',
  'share',
  'stats',
  'vocab',
] as const;

export function pickMessages(messages: MessageTree, namespaces: readonly string[]): MessageTree {
  const picked: MessageTree = {};
  for (const ns of namespaces) {
    if (ns in messages) {
      picked[ns] = messages[ns];
    }
  }
  return picked;
}
