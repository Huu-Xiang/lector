export const WELCOME_CODE = 'WELCOME123';
/** Exclusive end, UTC: the offer runs through 15 December. Mirrors the admin campaign's expiry. */
export const WELCOME_OFFER_ENDS = '2026-12-16T00:00:00Z';

export function welcomeOfferOpen(now = Date.now()): boolean {
  return now < Date.parse(WELCOME_OFFER_ENDS);
}
