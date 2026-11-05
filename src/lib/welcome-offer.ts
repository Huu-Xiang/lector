export const WELCOME_CODE = 'WELCOME123';
/** Exclusive end: midnight after 15 December, Beijing time. Mirrors the admin campaign's expiry. */
export const WELCOME_OFFER_ENDS = '2026-12-15T16:00:00Z';

export function welcomeOfferOpen(now = Date.now()): boolean {
  return now < Date.parse(WELCOME_OFFER_ENDS);
}
