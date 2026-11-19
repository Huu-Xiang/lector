import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'fs';
import { resendPayload, sendEmail, setEmailTransport, type EmailMessage } from './email';

const FILE = '.test-data/emails-test.jsonl';

afterEach(() => {
  setEmailTransport(null);
  delete process.env.EMAIL_FILE;
  rmSync(FILE, { force: true });
});

describe('sendEmail transports', () => {
  test('an injected transport receives the message verbatim', async () => {
    const got: EmailMessage[] = [];
    setEmailTransport(async (m) => {
      got.push(m);
    });
    await sendEmail({ to: 'a@b.c', subject: 's', text: 't' });
    expect(got).toEqual([{ to: 'a@b.c', subject: 's', text: 't' }]);
  });

  test('EMAIL_FILE appends one JSON line per message (e2e reads links back out)', async () => {
    process.env.EMAIL_FILE = FILE;
    setEmailTransport(null); // re-resolve from env
    await sendEmail({ to: 'x@y.z', subject: 'Verify', text: 'https://example.com/verify?token=1' });
    await sendEmail({ to: 'x@y.z', subject: 'Reset', text: 'https://example.com/reset?token=2' });

    expect(existsSync(FILE)).toBe(true);
    const lines = readFileSync(FILE, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].subject).toBe('Verify');
    expect(lines[1].text).toContain('token=2');
  });

  test('an injected transport receives a template send verbatim', async () => {
    const got: EmailMessage[] = [];
    setEmailTransport(async (m) => {
      got.push(m);
    });
    const message: EmailMessage = {
      to: 'a@b.c',
      subject: 'welcome-on-account-create',
      text: 'welcome-on-account-create',
      template: {
        id: 'welcome-on-account-create',
        variables: { USER_NAME: 'Ada', LANGUAGE: 'Afrikaans', APP_URL: 'https://app.lector.dev' },
      },
    };
    await sendEmail(message);
    expect(got).toEqual([message]);
  });

  test('EMAIL_FILE records the template field', async () => {
    process.env.EMAIL_FILE = FILE;
    setEmailTransport(null);
    await sendEmail({
      to: 'x@y.z',
      subject: 'anki-after-10-saved-words',
      text: 'anki-after-10-saved-words',
      template: { id: 'anki-after-10-saved-words', variables: { USER_NAME: 'Ada' } },
    });

    const line = JSON.parse(readFileSync(FILE, 'utf8').trim());
    expect(line.template.id).toBe('anki-after-10-saved-words');
    expect(line.template.variables.USER_NAME).toBe('Ada');
  });
});

describe('resendPayload', () => {
  test('a template send has the template id and omits text', () => {
    const payload = resendPayload('Support <support@lector.dev>', {
      to: 'a@b.c',
      subject: 'welcome-on-account-create',
      text: 'welcome-on-account-create',
      template: {
        id: 'welcome-on-account-create',
        variables: { USER_NAME: 'Ada' },
      },
    });
    expect(payload).toEqual({
      from: 'Support <support@lector.dev>',
      to: 'a@b.c',
      template: { id: 'welcome-on-account-create', variables: { USER_NAME: 'Ada' } },
    });
    expect(payload).not.toHaveProperty('text');
    expect(payload).not.toHaveProperty('html');
    expect(payload).not.toHaveProperty('subject');
  });

  test('a template send can carry List-Unsubscribe headers', () => {
    const payload = resendPayload('Support <support@lector.dev>', {
      to: 'a@b.c',
      subject: 'day-1-registered-no-word-saved',
      text: 'day-1-registered-no-word-saved',
      headers: {
        'List-Unsubscribe': '<https://app.lector.dev/api/email/unsubscribe?token=x>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      template: { id: 'day-1-registered-no-word-saved', variables: { STOP_URL: 'https://x' } },
    });
    expect(payload.headers).toEqual({
      'List-Unsubscribe': '<https://app.lector.dev/api/email/unsubscribe?token=x>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  test('a text send keeps subject and text', () => {
    expect(
      resendPayload('Lector <no-reply@lector.dev>', {
        to: 'a@b.c',
        subject: 'Verify your Lector email address',
        text: 'Confirm here',
      }),
    ).toEqual({
      from: 'Lector <no-reply@lector.dev>',
      to: 'a@b.c',
      subject: 'Verify your Lector email address',
      text: 'Confirm here',
    });
  });
});

describe('resendPayload reply_to and attachments', () => {
  const base = { to: 'o@x.y', subject: 's', text: 't' };

  test('maps replyTo to reply_to and passes attachments', () => {
    const attachments = [{ filename: 'image-1.png', content: 'AAEC' }];
    const payload = resendPayload('from@x.y', { ...base, replyTo: 'u@x.y', attachments });
    expect(payload.reply_to).toBe('u@x.y');
    expect(payload.attachments).toEqual(attachments);
    expect(payload).not.toHaveProperty('replyTo');
  });

  test('omits both fields when unset or empty', () => {
    const payload = resendPayload('from@x.y', { ...base, attachments: [] });
    expect(payload).not.toHaveProperty('reply_to');
    expect(payload).not.toHaveProperty('attachments');
  });

  test('the file transport keeps replyTo and attachments', async () => {
    process.env.EMAIL_FILE = FILE;
    setEmailTransport(null);
    await sendEmail({
      ...base,
      replyTo: 'u@x.y',
      attachments: [{ filename: 'a.png', content: 'AAEC' }],
    });
    const line = JSON.parse(readFileSync(FILE, 'utf8').trim());
    expect(line.replyTo).toBe('u@x.y');
    expect(line.attachments[0].filename).toBe('a.png');
  });
});

describe('Resend transport', () => {
  test('the request carries an abort signal so a stalled call ends', async () => {
    const realFetch = globalThis.fetch;
    let signal: AbortSignal | null | undefined;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    process.env.RESEND_API_KEY = 're_test';
    setEmailTransport(null);
    try {
      await sendEmail({ to: 'a@b.c', subject: 's', text: 't' });
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.RESEND_API_KEY;
    }
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });
});

describe('report email', () => {
  const message: EmailMessage = {
    to: 'learner@example.test',
    subject: 'Vocabulary report',
    text: 'Your report is attached.',
    attachments: [{ filename: 'report.pdf', content: 'JVBERg==' }],
  };

  test('resends the exact prepared request with an idempotency key', async () => {
    const { prepareReportEmail, sendPreparedReportEmail } = await import('./email');
    const prepared = prepareReportEmail(message);
    const originalFetch = globalThis.fetch;
    const previousKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'test-key';
    const requests: RequestInit[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      requests.push(init!);
      return Response.json({ id: 'message-id' });
    }) as unknown as typeof fetch;
    try {
      expect(await sendPreparedReportEmail(prepared, 'report/test')).toBe('message-id');
      expect(await sendPreparedReportEmail(prepared, 'report/test')).toBe('message-id');
      expect(requests).toHaveLength(2);
      expect(requests[0]?.body).toBe(prepared);
      expect(requests[1]?.body).toBe(prepared);
      expect(new Headers(requests[0]?.headers).get('Idempotency-Key')).toBe('report/test');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousKey;
    }
  });

  test('classifies deterministic rejects separately from requests with unknown outcomes', async () => {
    const { prepareReportEmail, ReportEmailError, sendPreparedReportEmail } =
      await import('./email');
    const originalFetch = globalThis.fetch;
    const previousKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'test-key';
    const statuses = new Map([
      [400, false],
      [408, true],
      [409, true],
      [429, false],
      [503, true],
    ]);
    try {
      const payload = prepareReportEmail(message);
      for (const [status, uncertain] of statuses) {
        globalThis.fetch = (async () =>
          new Response('provider error', { status })) as unknown as typeof fetch;
        try {
          await sendPreparedReportEmail(payload, 'report/classification');
          throw new Error('expected report send to reject');
        } catch (error) {
          expect(error).toBeInstanceOf(ReportEmailError);
          expect(error).toMatchObject({ uncertain });
        }
      }
      globalThis.fetch = (async () => {
        throw new TypeError('socket closed after write');
      }) as unknown as typeof fetch;
      await expect(sendPreparedReportEmail(payload, 'report/classification')).rejects.toMatchObject(
        {
          uncertain: true,
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (previousKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousKey;
    }
  });

  test('captures the PDF attachment in file mode', async () => {
    const { prepareReportEmail, sendPreparedReportEmail } = await import('./email');
    process.env.EMAIL_FILE = FILE;
    await sendPreparedReportEmail(prepareReportEmail(message), 'report/file');
    const captured = JSON.parse(readFileSync(FILE, 'utf8'));
    expect(captured.to).toBe(message.to);
    expect(captured.attachments).toEqual(message.attachments);
  });
});
