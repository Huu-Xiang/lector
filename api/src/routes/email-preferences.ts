import { Hono, type Context } from 'hono';
import { db } from '../db';
import { config } from '../lib/config';
import { getUserEmail } from '../lib/billing';
import { isUnsubscribed, recordUnsubscribe, removeUnsubscribe } from '../lib/email-unsubscribe';
import { resolveUserId } from '../lib/user';

interface EmailPreferencesDeps {
  authRequired: boolean;
  userEmail: (userId: string) => string | null;
}

/** The signed-in switch for product mail. It shares the unsubscribe list and takes the address from the session only. */
export function createEmailPreferencesApp(deps: EmailPreferencesDeps) {
  const app = new Hono();

  function ownEmail(c: Context): string | null {
    if (!deps.authRequired) return null;
    return deps.userEmail(resolveUserId(true, c));
  }

  app.get('/', (c) => {
    const email = ownEmail(c);
    if (!email) return c.json({ error: 'Product emails are not available here' }, 404);
    return c.json({ productEmails: !isUnsubscribed(db, email) });
  });

  app.put('/', async (c) => {
    const email = ownEmail(c);
    if (!email) return c.json({ error: 'Product emails are not available here' }, 404);
    const body = await c.req.json().catch(() => null);
    const next = (body as { productEmails?: unknown } | null)?.productEmails;
    if (typeof next !== 'boolean') {
      return c.json({ error: 'productEmails must be true or false' }, 400);
    }
    if (next) removeUnsubscribe(db, email);
    else recordUnsubscribe(db, email, new Date().toISOString());
    return c.json({ productEmails: next });
  });

  return app;
}

export default createEmailPreferencesApp({
  authRequired: config.authRequired,
  userEmail: getUserEmail,
});
