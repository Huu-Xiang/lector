const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  '20minutemail.com',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'grr.la',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mintemail.com',
  'mohmal.com',
  'moakt.com',
  'sharklasers.com',
  'spam4.me',
  'temp-mail.org',
  'temp-mail.io',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
  'yopmail.net',
  'mail.tm',
  'mailpoof.com',
  'burnermail.io',
  'emailfake.com',
  'tmpmail.org',
  'tmail.ws',
  '1secmail.com',
  'linshiyouxiang.net',
  '24mail.chacuo.net',
]);

function split(email: string): [string, string] | null {
  const at = email.trim().toLowerCase().lastIndexOf('@');
  if (at <= 0) return null;
  const lower = email.trim().toLowerCase();
  return [lower.slice(0, at), lower.slice(at + 1)];
}

/** One key per mailbox: no `+tag`, and Gmail ignores dots and the googlemail alias. */
export function canonicalEmail(email: string): string {
  const parts = split(email);
  if (!parts) return email.trim().toLowerCase();
  let [local, domain] = parts;
  local = local.split('+')[0];
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

export function isDisposableEmail(email: string): boolean {
  const domain = split(email)?.[1];
  return domain !== undefined && DISPOSABLE_DOMAINS.has(domain);
}

/** Domains whose addresses may share a canonical key with `email`. */
export function aliasDomains(email: string): string[] {
  const domain = split(email)?.[1];
  if (!domain) return [];
  return GMAIL_DOMAINS.has(domain) ? [...GMAIL_DOMAINS] : [domain];
}
