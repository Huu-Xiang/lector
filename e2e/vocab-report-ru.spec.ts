import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { VocabReportSnapshot } from '../languages/en/vocab-report';

const CLOUD_API = `http://localhost:${process.env.E2E_AUTH_API_PORT || '3462'}`;
const OUTBOX = path.join(__dirname, '..', 'tmp', 'e2e-data-cloud', 'emails.jsonl');

type Mail = {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: string }[];
};

test('saves a Russian vocabulary report and emails the PDF to the verified account', async ({
  request,
  baseURL,
}) => {
  test.skip(!!process.env.E2E_EXTERNAL_SERVER, 'requires the cloud API and file outbox');

  const email = `report-ru+${randomUUID()}@e2e.test`;
  const password = 'report-password-123';
  const headers = { Origin: baseURL! };
  const signup = await request.post(`${CLOUD_API}/api/auth/sign-up/email`, {
    headers,
    data: { name: 'Report Reader', email, password },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  const { user } = await signup.json();

  const mail = (): Mail[] =>
    readFileSync(OUTBOX, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Mail)
      .filter((message) => message.to === email);
  const verificationLink = () =>
    mail()
      .find((message) => /verify/i.test(message.subject))
      ?.text.match(/https?:\/\/\S+/)?.[0];
  await expect.poll(verificationLink).toBeTruthy();
  const verify = await request.get(verificationLink()!, { headers, maxRedirects: 0 });
  expect([200, 302]).toContain(verify.status());
  const login = await request.post(`${CLOUD_API}/api/auth/sign-in/email`, {
    headers,
    data: { email, password },
  });
  expect(login.ok(), await login.text()).toBe(true);

  const snapshot: VocabReportSnapshot = {
    attemptId: randomUUID(),
    takenAt: new Date().toISOString(),
    locale: 'ru',
    estimate: 4800,
    margin: 500,
    low: 4300,
    high: 5300,
    capped: false,
    level: 'B2',
    bookSlugs: ['a-christmas-carol'],
  };
  const reports = `${CLOUD_API}/api/vocab-test-reports`;
  const invalid = await request.post(reports, {
    headers,
    data: { expectedUserId: user.id, snapshot: { ...snapshot, locale: 'ru-RU' } },
  });
  expect(invalid.status()).toBe(400);

  const saved = await request.post(reports, {
    headers,
    data: { expectedUserId: user.id, snapshot },
  });
  expect(saved.status(), await saved.text()).toBe(201);
  const report = await saved.json();
  expect(report).toMatchObject({ snapshot, deliveryStatus: 'sent' });
  const history = await request.get(reports);
  expect(await history.json()).toEqual({ reports: [report], nextCursor: null });

  const pdfMail = mail().filter((message) => message.attachments?.length);
  expect(pdfMail).toHaveLength(1);
  expect(pdfMail[0]?.subject).toBe('Ваш отчёт о словарном запасе — Readfox');
  const attachment = pdfMail[0]?.attachments?.[0];
  expect(attachment?.filename).toBe('readfox-vocabulary-report.pdf');
  expect(Buffer.from(attachment!.content, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
});
