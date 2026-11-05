import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCurrentUserId } from '../lib/user';
import { getUserEmail } from '../lib/billing';
import { entitlements } from '../lib/entitlements';
import {
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_MESSAGE_CHARS,
  checkFeedbackRate,
  detectImageKind,
  extensionFor,
  isAllowedImageMime,
  submitFeedback,
} from '../lib/feedback';
import type { EmailAttachment } from '../lib/email';

const MAX_BODY_BYTES = MAX_IMAGES * MAX_IMAGE_BYTES + 256 * 1024;

export interface FeedbackRouteDeps {
  getUserId: (c: Parameters<typeof getCurrentUserId>[0]) => string;
  getAccount: (userId: string) => { email: string | null; plan: string };
  now: () => number;
}

export function makeFeedbackRoutes(
  deps: FeedbackRouteDeps = {
    getUserId: getCurrentUserId,
    getAccount: (userId) => ({
      email: getUserEmail(userId),
      plan: entitlements.resolveEntitlements(userId).plan,
    }),
    now: Date.now,
  },
) {
  const app = new Hono();

  app.post(
    '/',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'too_large' }, 413),
    }),
    async (c) => {
      const userId = deps.getUserId(c);
      const now = deps.now();

      const verdict = checkFeedbackRate(userId, now);
      if (verdict !== 'ok') return c.json({ error: 'rate_limited' }, 429);

      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        return c.json({ error: 'invalid_message' }, 400);
      }

      const rawText = form.get('message');
      const text = typeof rawText === 'string' ? rawText.trim() : '';
      if (text.length < 1 || text.length > MAX_MESSAGE_CHARS) {
        return c.json({ error: 'invalid_message' }, 400);
      }

      const files = form.getAll('images').filter((v): v is File => typeof v !== 'string');
      if (files.length > MAX_IMAGES) return c.json({ error: 'too_many_images' }, 400);

      const attachments: EmailAttachment[] = [];
      for (const file of files) {
        if (file.size > MAX_IMAGE_BYTES) return c.json({ error: 'image_too_large' }, 413);
        if (!isAllowedImageMime(file.type)) return c.json({ error: 'bad_image_type' }, 400);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const kind = detectImageKind(bytes);
        if (!kind) return c.json({ error: 'bad_image_type' }, 400);
        attachments.push({
          filename: `image-${attachments.length + 1}.${extensionFor(kind)}`,
          content: Buffer.from(bytes).toString('base64'),
        });
      }

      const rawLocale = form.get('locale');
      const locale =
        typeof rawLocale === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(rawLocale) ? rawLocale : '';
      const account = deps.getAccount(userId);

      const sent = await submitFeedback({
        userId,
        email: account.email,
        plan: account.plan,
        locale,
        userAgent: (c.req.header('user-agent') ?? '').slice(0, 300),
        text,
        attachments,
        now: new Date(now),
      });
      if (!sent) return c.json({ error: 'send_failed' }, 502);
      return c.json({ ok: true });
    },
  );

  return app;
}

export default makeFeedbackRoutes();
