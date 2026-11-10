import { createHash } from 'crypto';
import type { Database } from 'bun:sqlite';
import { canonicalEmail } from './signup-email';
import { WELCOME_CODE } from './welcome-offer';

export const WELCOME_DOMAIN_LIMIT = 3;
export const WELCOME_DOMAIN_WINDOW_DAYS = 30;

/** Domains with many unrelated users. They are exempt from the per-domain limit. */
export const PUBLIC_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.jp',
  'icloud.com',
  'me.com',
  'qq.com',
  'foxmail.com',
  '163.com',
  '126.com',
  'yeah.net',
  'sina.com',
  'sohu.com',
  'aliyun.com',
  'proton.me',
  'protonmail.com',
  'naver.com',
  'daum.net',
  'hanmail.net',
]);

export function isPublicMailDomain(domain: string): boolean {
  return PUBLIC_MAIL_DOMAINS.has(domain) || /^gmx\.[a-z.]+$/.test(domain);
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function welcomeClaimKeys(email: string): {
  emailHash: string;
  domainHash: string;
  domain: string;
} {
  const canonical = canonicalEmail(email);
  const domain = canonical.slice(canonical.lastIndexOf('@') + 1);
  return {
    emailHash: sha256(`readfox-welcome-email:${canonical}`),
    domainHash: sha256(`readfox-welcome-domain:${domain}`),
    domain,
  };
}

export type WelcomeRefusal = 'mailbox_claimed' | 'domain_limit';

/** Why the welcome offer must be refused for `email`, or null when it may be given. */
export function welcomeClaimProblem(
  database: Database,
  email: string,
  now: Date,
): WelcomeRefusal | null {
  const { emailHash, domainHash, domain } = welcomeClaimKeys(email);
  if (database.prepare('SELECT 1 FROM welcome_claims WHERE emailHash = ?').get(emailHash)) {
    return 'mailbox_claimed';
  }
  if (isPublicMailDomain(domain)) return null;
  const since = new Date(now.getTime() - WELCOME_DOMAIN_WINDOW_DAYS * 86_400_000).toISOString();
  const { n } = database
    .prepare('SELECT COUNT(*) AS n FROM welcome_claims WHERE domainHash = ? AND claimedAt >= ?')
    .get(domainHash, since) as { n: number };
  return n >= WELCOME_DOMAIN_LIMIT ? 'domain_limit' : null;
}

export function recordWelcomeClaim(database: Database, email: string, now: Date): void {
  const { emailHash, domainHash } = welcomeClaimKeys(email);
  database
    .prepare(
      'INSERT OR IGNORE INTO welcome_claims (emailHash, domainHash, claimedAt) VALUES (?, ?, ?)',
    )
    .run(emailHash, domainHash, now.toISOString());
}

/** Account email by id, or null when the auth tables are absent or the user is gone. */
export function userEmail(database: Database, userId: string): string | null {
  try {
    const row = database.prepare('SELECT email FROM user WHERE id = ?').get(userId) as
      | { email: string }
      | undefined;
    return row?.email ?? null;
  } catch {
    return null;
  }
}

/** Records a claim for every account that already redeemed the welcome code. Safe to run twice. */
export function backfillWelcomeClaims(database: Database): number {
  let rows: { email: string; at: string }[];
  try {
    rows = database
      .prepare(
        `SELECT u.email AS email, MIN(r.at) AS at
         FROM redeem_uses r
         JOIN user u ON u.id = r.userId
         WHERE r.code = ?
         GROUP BY u.id`,
      )
      .all(WELCOME_CODE) as { email: string; at: string }[];
  } catch {
    return 0;
  }
  let added = 0;
  database.transaction(() => {
    for (const row of rows) {
      const { emailHash, domainHash } = welcomeClaimKeys(row.email);
      added += database
        .prepare(
          'INSERT OR IGNORE INTO welcome_claims (emailHash, domainHash, claimedAt) VALUES (?, ?, ?)',
        )
        .run(emailHash, domainHash, row.at).changes;
    }
  })();
  return added;
}
