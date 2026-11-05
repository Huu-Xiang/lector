import '../test-guard';
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { HTTPException } from 'hono/http-exception';
import { Hono } from 'hono';
import { db } from '../db';
import { setEmailTransport, type EmailMessage } from '../lib/email';
import { makeFeedbackRoutes } from './feedback';

const USER = 'fb-user-1';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const NOW = Date.parse('2026-06-01T12:00:00Z');

let sent: EmailMessage[];
let signedIn = true;
let clock = NOW;
let sendFails = false;

function appForTest() {
  const app = new Hono();
  app.route(
    '/api/feedback',
    makeFeedbackRoutes({
      getUserId: () => {
        if (!signedIn) throw new HTTPException(401, { message: 'Authentication required' });
        return USER;
      },
      getAccount: () => ({ email: 'ada@example.com', plan: 'cloud' }),
      now: () => clock,
    }),
  );
  app.onError((err, c) =>
    err instanceof HTTPException ? c.json({ error: err.message }, err.status) : c.json({}, 500),
  );
  return app;
}

function post(form: FormData) {
  return appForTest().request('/api/feedback', {
    method: 'POST',
    body: form,
    headers: { 'user-agent': 'TestAgent/1.0' },
  });
}

function formWith(message: string, images: File[] = []) {
  const form = new FormData();
  form.set('message', message);
  form.set('locale', 'en');
  for (const image of images) form.append('images', image);
  return form;
}

const png = (name = 'a.png') => new File([PNG], name, { type: 'image/png' });

function rowCount() {
  return (db.prepare('SELECT COUNT(*) AS n FROM feedback_messages').get() as { n: number }).n;
}

beforeEach(() => {
  db.prepare('DELETE FROM feedback_messages').run();
  sent = [];
  signedIn = true;
  clock = NOW;
  sendFails = false;
  process.env.FEEDBACK_EMAIL = 'owner@example.com';
  delete process.env.LECTOR_ADMIN_EMAILS;
  setEmailTransport(async (m) => {
    if (sendFails) throw new Error('boom');
    sent.push(m);
  });
});

afterEach(() => {
  setEmailTransport(null);
  delete process.env.FEEDBACK_EMAIL;
  db.prepare('DELETE FROM feedback_messages').run();
});

describe('POST /api/feedback', () => {
  test('emails the message with reply-to and image attachments', async () => {
    const res = await post(formWith('The reader   is great\nbut slow', [png(), png('b.png')]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.to).toBe('owner@example.com');
    expect(mail.replyTo).toBe('ada@example.com');
    expect(mail.subject).toBe('[Readfox feedback] The reader is great but slow');
    expect(mail.text).toContain('The reader   is great');
    expect(mail.text).toContain(`User id: ${USER}`);
    expect(mail.text).toContain('Account email: ada@example.com');
    expect(mail.text).toContain('Plan: cloud');
    expect(mail.text).toContain('Interface locale: en');
    expect(mail.text).toContain('User agent: TestAgent/1.0');
    expect(mail.attachments).toEqual([
      { filename: 'image-1.png', content: Buffer.from(PNG).toString('base64') },
      { filename: 'image-2.png', content: Buffer.from(PNG).toString('base64') },
    ]);
    const row = db.prepare('SELECT * FROM feedback_messages').get() as Record<string, unknown>;
    expect(row.userId).toBe(USER);
    expect(row.imageCount).toBe(2);
    expect(row.emailed).toBe(1);
  });

  test('cuts the subject at 60 characters', async () => {
    await post(formWith('x'.repeat(200)));
    expect(sent[0].subject).toBe(`[Readfox feedback] ${'x'.repeat(60)}`);
  });

  test('answers 401 when not signed in', async () => {
    signedIn = false;
    const res = await post(formWith('hello'));
    expect(res.status).toBe(401);
    expect(rowCount()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  test('rejects empty and too long text', async () => {
    expect((await post(formWith('   '))).status).toBe(400);
    const tooLong = await post(formWith('x'.repeat(5001)));
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toEqual({ error: 'invalid_message' });
    expect((await post(formWith('x'.repeat(5000)))).status).toBe(200);
    expect(rowCount()).toBe(1);
  });

  test('rejects a bad MIME type and fake image bytes', async () => {
    const pdf = new File([PNG], 'a.pdf', { type: 'application/pdf' });
    const res = await post(formWith('hi', [pdf]));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_image_type' });
    const fake = new File([new TextEncoder().encode('not an image')], 'a.png', {
      type: 'image/png',
    });
    expect((await post(formWith('hi', [fake]))).status).toBe(400);
    expect(rowCount()).toBe(0);
  });

  test('rejects an image over 5 MB and more than 3 images', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    const res = await post(formWith('hi', [new File([big], 'big.png', { type: 'image/png' })]));
    expect(res.status).toBe(413);
    const many = await post(formWith('hi', [png(), png(), png(), png()]));
    expect(many.status).toBe(400);
    expect(await many.json()).toEqual({ error: 'too_many_images' });
  });

  test('limits each user to 5 per hour', async () => {
    for (let i = 0; i < 5; i++) expect((await post(formWith(`m${i}`))).status).toBe(200);
    const res = await post(formWith('one more'));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    clock += 61 * 60_000;
    expect((await post(formWith('later'))).status).toBe(200);
  });

  test('limits each user to 20 per day', async () => {
    const stmt = db.prepare(
      'INSERT INTO feedback_messages (id, userId, createdAt, text) VALUES (?, ?, ?, ?)',
    );
    for (let i = 0; i < 20; i++) {
      stmt.run(`d${i}`, USER, new Date(NOW - (2 + i * 0.5) * 3_600_000).toISOString(), 'x');
    }
    expect((await post(formWith('too many today'))).status).toBe(429);
  });

  test('limits the whole site to 200 per day', async () => {
    const stmt = db.prepare(
      'INSERT INTO feedback_messages (id, userId, createdAt, text) VALUES (?, ?, ?, ?)',
    );
    for (let i = 0; i < 200; i++) {
      stmt.run(`s${i}`, `other-${i}`, new Date(NOW - 3_600_000 * 2).toISOString(), 'x');
    }
    expect((await post(formWith('site is full'))).status).toBe(429);
  });

  test('stores the row and answers success when no recipient is set', async () => {
    delete process.env.FEEDBACK_EMAIL;
    const res = await post(formWith('no mail'));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
    const row = db.prepare('SELECT emailed FROM feedback_messages').get() as { emailed: number };
    expect(row.emailed).toBe(0);
  });

  test('falls back to the first LECTOR_ADMIN_EMAILS address', async () => {
    delete process.env.FEEDBACK_EMAIL;
    process.env.LECTOR_ADMIN_EMAILS = 'Boss@Example.com, other@example.com';
    await post(formWith('to boss'));
    expect(sent[0].to).toBe('boss@example.com');
  });

  test('keeps the row with emailed=0 and answers 502 when sending fails', async () => {
    sendFails = true;
    const res = await post(formWith('mail is down'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'send_failed' });
    const row = db.prepare('SELECT emailed FROM feedback_messages').get() as { emailed: number };
    expect(row.emailed).toBe(0);
  });
});
